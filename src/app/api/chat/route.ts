import {NextRequest} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {tool} from 'ai';
import {z} from 'zod';
import {
  createChatWithFirstMessage,
  insertMessage,
  updateChatTimestamp,
  upsertUser,
  getChatById,
  createDocument,
  updateDocument,
  getDocumentById,
  getDocumentsByUserId,
} from '~/server/db/client';
import {major} from '~/server/lib/models';
import {EventSourceWriter} from '~/server/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  console.log('[CHAT API] POST request received');
  try {
    // Authenticate user
    console.log('[CHAT API] Authenticating user...');
    const authData = await auth();
    if (!authData.userId) {
      console.log('[CHAT API] Authentication failed - no userId');
      return new Response('Unauthorized', {status: 401});
    }

    const userId = authData.userId;
    const userName = (authData.sessionClaims?.email as string) || 'User';
    console.log('[CHAT API] User authenticated:', userId, userName);

    // Parse request body
    const {messages, chatId} = await req.json();
    console.log(
      '[CHAT API] Request body parsed. chatId:',
      chatId,
      'messages count:',
      messages?.length,
    );

    if (!messages || !Array.isArray(messages)) {
      console.log('[CHAT API] Invalid messages format');
      return new Response('Invalid messages format', {status: 400});
    }

    // Ensure user exists in database
    console.log('[CHAT API] Upserting user in database...');
    await upsertUser(userId, userName);
    console.log('[CHAT API] User upserted');

    // Get or create chat
    let currentChatId = chatId;
    if (chatId) {
      console.log('[CHAT API] Using existing chat:', chatId);
      // Verify chat belongs to user
      const chat = await getChatById(chatId);
      if (!chat || chat.user_id !== userId) {
        console.log('[CHAT API] Chat not found or unauthorized');
        return new Response('Chat not found or unauthorized', {status: 404});
      }
    } else {
      console.log('[CHAT API] Creating new chat...');
      // Create new chat with first user message
      const userMessage = messages[messages.length - 1];
      const title =
        typeof userMessage.content === 'string'
          ? userMessage.content.slice(0, 50)
          : 'New Chat';
      const result = await createChatWithFirstMessage(
        userId,
        userMessage,
        title,
      );
      currentChatId = result.chat.id;
      console.log('[CHAT API] New chat created:', currentChatId);
    }

    // Store the latest user message if chat already exists
    if (chatId) {
      console.log('[CHAT API] Storing user message in existing chat...');
      const latestUserMessage = messages[messages.length - 1];
      if (latestUserMessage.role === 'user') {
        await insertMessage(chatId, latestUserMessage);
        console.log('[CHAT API] User message stored');
      }
    }

    // Define tools with proper AI SDK tool() helper
    console.log('[CHAT API] Defining tools...');
    const tools = {
      createDocument: tool({
        description:
          'Create a new document for the user. Use this when the user asks to create, write, or save a document.',
        inputSchema: z.object({
          title: z.string().describe('The title of the document'),
          content: z.string().describe('The content of the document'),
        }),
        execute: async ({title, content}: {title: string; content: string}) => {
          const document = await createDocument(userId, title, content);
          return {
            success: true,
            documentId: document?.id,
            title: document?.title,
            message: `Document "${title}" created successfully`,
          };
        },
      }),
      updateDocument: tool({
        description:
          'Update an existing document. Use this when the user asks to edit, modify, or update a document.',
        inputSchema: z.object({
          id: z.number().describe('The ID of the document to update'),
          title: z.string().describe('The new title of the document'),
          content: z.string().describe('The new content of the document'),
        }),
        execute: async ({
          id,
          title,
          content,
        }: {
          id: number;
          title: string;
          content: string;
        }) => {
          const document = await getDocumentById(id);
          if (!document || document.user_id !== userId) {
            return {
              success: false,
              message: 'Document not found or unauthorized',
            };
          }
          const updated = await updateDocument(id, title, content);
          return {
            success: true,
            documentId: updated?.id,
            title: updated?.title,
            message: `Document "${title}" updated successfully`,
          };
        },
      }),
      getDocument: tool({
        description:
          'Get a document by ID. Use this when the user asks to view, read, or retrieve a specific document.',
        inputSchema: z.object({
          id: z.number().describe('The ID of the document to retrieve'),
        }),
        execute: async ({id}: {id: number}) => {
          const document = await getDocumentById(id);
          if (!document || document.user_id !== userId) {
            return {
              success: false,
              message: 'Document not found or unauthorized',
            };
          }
          return {
            success: true,
            id: document.id,
            title: document.title,
            content: document.content,
            createdAt: document.created_at,
            updatedAt: document.updated_at,
          };
        },
      }),
      listDocuments: tool({
        description:
          'List all documents for the user. Use this when the user asks to see, list, or view all their documents.',
        inputSchema: z.object({}),
        execute: async () => {
          const documents = await getDocumentsByUserId(userId);
          return {
            success: true,
            documents: documents.map(doc => ({
              id: doc.id,
              title: doc.title,
              createdAt: doc.created_at,
              updatedAt: doc.updated_at,
            })),
            count: documents.length,
            message: `Found ${documents.length} document(s)`,
          };
        },
      }),
    };
    console.log('[CHAT API] Tools defined:', Object.keys(tools));

    // Add system message to the messages array
    console.log('[CHAT API] Preparing messages with system prompt...');
    const messagesWithSystem = [
      {
        role: 'system' as const,
        content:
          'You are a helpful assistant that manages documents for users. When users ask to list, view, or work with their documents, use the appropriate tools. Be conversational and helpful in your responses.',
      },
      ...messages,
    ];
    console.log(
      '[CHAT API] Messages with system count:',
      messagesWithSystem.length,
    );

    // Stream response using LLMClient
    console.log('[CHAT API] Calling major.genTextStream...');
    const {queue, data} = await major.genTextStream(
      messagesWithSystem,
      tools,
      0.7,
    );
    console.log(
      '[CHAT API] genTextStream returned, creating readable stream...',
    );

    // Create EventSourceWriter for SSE streaming
    const sseWriter = new EventSourceWriter();

    // Add the queue to the writer with labels for different event types
    sseWriter.addMixedQueue(queue, {
      text: 'text',
      toolCall: 'tool-call',
      toolResult: 'tool-result',
    });

    // Process the stream and handle completion
    void (async () => {
      try {
        console.log('[CHAT API] Waiting for data() to complete...');
        const text = await data();
        console.log('[CHAT API] data() completed. Text length:', text?.length);

        if (text && currentChatId) {
          console.log('[CHAT API] Storing assistant message...');
          await insertMessage(currentChatId, {
            role: 'assistant',
            content: text,
          });
          await updateChatTimestamp(currentChatId);
          console.log('[CHAT API] Assistant message stored');
        }

        // Send chatId before flushing
        await sseWriter.sendEvent('meta', {chatId: currentChatId});
        await sseWriter.flush();
        await sseWriter.close();
        console.log('[CHAT API] Stream complete');
      } catch (error) {
        console.error('[CHAT API] Stream error:', error);
        await sseWriter.sendEvent('error', {
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    })();

    // Return stream response with SSE content type
    console.log('[CHAT API] Returning response with chat ID:', currentChatId);
    return new Response(sseWriter.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Chat-Id': currentChatId.toString(),
      },
    });
  } catch (error) {
    console.error('[CHAT API] ERROR:', error);
    console.error(
      '[CHAT API] Error stack:',
      error instanceof Error ? error.stack : 'no stack',
    );
    const message =
      error instanceof Error ? error.message : 'Internal server error';
    return new Response(message, {status: 500});
  }
}

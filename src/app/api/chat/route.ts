import {NextRequest} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {major} from '~/server/lib/models';
import type {ModelMessage, Tool} from 'ai';
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
import type {ToolCall} from '~/server/lib/models/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RequestBody {
  messages: ModelMessage[];
  chatId?: number;
}

// Authentication
const authenticateUser = async () => {
  const authData = await auth();
  if (!authData.userId) {
    throw new Error('Unauthorized');
  }
  return {
    userId: authData.userId,
    userName: (authData.sessionClaims?.email as string) || 'User',
  };
};

// Chat Management
const getOrCreateChat = async (
  userId: string,
  chatId: number | undefined,
  messages: ModelMessage[],
): Promise<number> => {
  if (chatId) {
    // Verify chat belongs to user
    const chat = await getChatById(chatId);
    if (!chat || chat.user_id !== userId) {
      throw new Error('Chat not found or unauthorized');
    }
    return chatId;
  }

  // Create new chat with first user message
  const userMessage = messages[messages.length - 1];
  const title =
    typeof userMessage.content === 'string'
      ? userMessage.content.slice(0, 50)
      : 'New Chat';
  const result = await createChatWithFirstMessage(userId, userMessage, title);
  return result.chat.id;
};

const storeUserMessage = async (
  chatId: number,
  messages: ModelMessage[],
): Promise<void> => {
  if (messages.length > 0) {
    const latestUserMessage = messages[messages.length - 1];
    if (latestUserMessage.role === 'user') {
      await insertMessage(chatId, latestUserMessage);
    }
  }
};

// Tools Definition
const createTools = (userId: string): Record<string, Tool> => {
  return {
    createDocument: {
      description:
        'Create a new document for the user. Use this when the user asks to create, write, or save a document.',
      inputSchema: z.object({
        title: z.string().describe('The title of the document'),
        content: z.string().describe('The content of the document'),
      }),
      execute: async (params: {title: string; content: string}) => {
        const document = await createDocument(
          userId,
          params.title,
          params.content,
        );
        return {
          success: true,
          documentId: document?.id,
          title: document?.title,
          message: `Document "${params.title}" created successfully`,
        };
      },
    },
    updateDocument: {
      description:
        'Update an existing document. Use this when the user asks to edit, modify, or update a document.',
      inputSchema: z.object({
        id: z.number().describe('The ID of the document to update'),
        title: z.string().describe('The new title of the document'),
        content: z.string().describe('The new content of the document'),
      }),
      execute: async (params: {id: number; title: string; content: string}) => {
        const document = await getDocumentById(params.id);
        if (!document || document.user_id !== userId) {
          return {
            success: false,
            message: 'Document not found or unauthorized',
          };
        }
        const updated = await updateDocument(
          params.id,
          params.title,
          params.content,
        );
        return {
          success: true,
          documentId: updated?.id,
          title: updated?.title,
          message: `Document "${params.title}" updated successfully`,
        };
      },
    },
    getDocument: {
      description:
        'Get a document by ID. Use this when the user asks to view, read, or retrieve a specific document.',
      inputSchema: z.object({
        id: z.number().describe('The ID of the document to retrieve'),
      }),
      execute: async (params: {id: number}) => {
        const document = await getDocumentById(params.id);
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
    },
    listDocuments: {
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
    },
  };
};

// Streaming
const createStreamingResponse = async (
  messages: ModelMessage[],
  tools: Record<string, Tool>,
  currentChatId: number,
  encoder: TextEncoder,
): Promise<ReadableStream> => {
  let assistantResponse = '';

  // Add system prompt with context about documents
  const systemPrompt: ModelMessage = {
    role: 'system',
    content:
      'You are a helpful assistant that manages documents for users. When users ask to list, view, or work with their documents, use the appropriate tools. Be conversational and helpful in your responses.',
  };

  const messagesWithSystem = [systemPrompt, ...messages];

  return new ReadableStream({
    async start(controller) {
      try {
        const {queue, data} = await major.genTextStream(
          messagesWithSystem,
          undefined,
          tools,
        );

        // Consume from queue immediately as chunks arrive
        // With maxSteps, this will include text after tool execution
        await queue.map(chunk => {
          if (typeof chunk === 'string') {
            assistantResponse += chunk;
            const eventData = `data: ${JSON.stringify({
              type: 'text',
              content: chunk,
              chatId: currentChatId,
            })}\n\n`;
            controller.enqueue(encoder.encode(eventData));
          } else {
            // It's a tool call notification
            const toolCall = chunk as ToolCall;
            const eventData = `data: ${JSON.stringify({
              type: 'tool_call',
              toolCall: {
                id: toolCall.toolCallId,
                name: toolCall.toolName,
                args: toolCall.args,
              },
              chatId: currentChatId,
            })}\n\n`;
            controller.enqueue(encoder.encode(eventData));
          }
        });

        // Wait for streaming to complete (includes all tool execution steps)
        await data();

        // Store the complete assistant response in database
        await storeAssistantResponse(currentChatId, assistantResponse);

        // Send done signal with chat ID
        sendDoneSignal(controller, encoder, currentChatId);
      } catch (error) {
        console.error('Streaming error:', error);
        controller.error(error);
      }
    },
  });
};

const storeAssistantResponse = async (
  chatId: number,
  response: string,
): Promise<void> => {
  if (response) {
    await insertMessage(chatId, {
      role: 'assistant',
      content: response,
    } as ModelMessage);
    await updateChatTimestamp(chatId);
  }
};

const sendDoneSignal = (
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  chatId: number,
): void => {
  const doneData = `data: ${JSON.stringify({
    done: true,
    chatId: chatId,
  })}\n\n`;
  controller.enqueue(encoder.encode(doneData));
  controller.close();
};

// Main POST Handler
export async function POST(req: NextRequest) {
  try {
    // Authenticate user
    const {userId, userName} = await authenticateUser();

    // Parse request body
    const {messages, chatId}: RequestBody = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response('Invalid messages format', {status: 400});
    }

    // Ensure user exists in database
    await upsertUser(userId, userName);

    // Get or create chat
    const currentChatId = await getOrCreateChat(userId, chatId, messages);

    // If chat already exists, store the latest user message
    if (chatId) {
      await storeUserMessage(currentChatId, messages);
    }

    // Create tools with user context
    const tools = createTools(userId);

    // Create streaming response
    const encoder = new TextEncoder();
    const stream = await createStreamingResponse(
      messages,
      tools,
      currentChatId,
      encoder,
    );

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Chat API error:', error);
    const message =
      error instanceof Error ? error.message : 'Internal server error';
    const status =
      message === 'Unauthorized'
        ? 401
        : message === 'Chat not found or unauthorized'
          ? 404
          : 500;
    return new Response(message, {status});
  }
}

import {NextRequest} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {major} from '~/server/lib/models';
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
} from '~/server/db/client';
import type {ToolCall} from '~/server/lib/models/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // Get authenticated user from Clerk
    const authData = await auth();
    if (!authData.userId) {
      return new Response('Unauthorized', {status: 401});
    }

    const userId = authData.userId;
    const {messages, chatId} = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response('Invalid messages format', {status: 400});
    }

    // Ensure user exists in database
    const userName = (authData.sessionClaims?.email as string) || 'User';
    await upsertUser(userId, userName);

    // Determine current chat ID
    let currentChatId: number;

    if (chatId) {
      // Verify chat belongs to user
      const chat = await getChatById(chatId);
      if (!chat || chat.user_id !== userId) {
        return new Response('Chat not found or unauthorized', {status: 404});
      }
      currentChatId = chatId;
    } else {
      // Create new chat with first user message
      const userMessage = messages[messages.length - 1];
      const title = userMessage.content.slice(0, 50);
      const result = await createChatWithFirstMessage(
        userId,
        'user',
        userMessage.content,
        title,
      );
      currentChatId = result.chat.id;
    }

    // If chat already exists, store the latest user message
    if (chatId && messages.length > 0) {
      const latestUserMessage = messages[messages.length - 1];
      if (latestUserMessage.role === 'user') {
        await insertMessage(currentChatId, 'user', latestUserMessage.content);
      }
    }

    const encoder = new TextEncoder();
    let assistantResponse = '';

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Define tools for document manipulation
          // const tools = {
          //   createDocument: tool({
          //     description:
          //       'Create a new document for the user. Use this when the user asks to create, write, or save a document.',
          //     parameters: z.object({
          //       title: z.string().describe('The title of the document'),
          //       content: z.string().describe('The content of the document'),
          //     }),
          //     execute: async ({title, content}) => {
          //       return {title, content};
          //     },
          //   }),
          //   updateDocument: tool({
          //     description:
          //       'Update an existing document. Use this when the user asks to edit, modify, or update a document.',
          //     parameters: z.object({
          //       id: z.number().describe('The ID of the document to update'),
          //       title: z.string().describe('The new title of the document'),
          //       content: z.string().describe('The new content of the document'),
          //     }),
          //     execute: async ({id, title, content}) => {
          //       return {id, title, content};
          //     },
          //   }),
          //   getDocument: tool({
          //     description:
          //       'Get a document by ID. Use this when the user asks to view, read, or retrieve a document.',
          //     parameters: z.object({
          //       id: z.number().describe('The ID of the document to retrieve'),
          //     }),
          //     execute: async ({id}) => {
          //       return {id};
          //     },
          //   }),
          // };

          const {queue, data} = await major.genTextStream(
            messages,
            // undefined,
            // tools,
          );

          // Start streaming in background - consumes from model and pushes to queue
          const streamPromise = data().catch(err => {
            console.error('Stream data error:', err);
            controller.error(err);
          });

          // Consume from queue immediately as chunks arrive
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
              // It's a tool call
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

          // Wait for streaming to complete
          // const result = await streamPromise;

          // Store text and tool calls in assistant response
          // if (result.toolCalls && result.toolCalls.length > 0) {
          //   const toolCallsText = result.toolCalls
          //     .map(
          //       tc => `[Tool Call: ${tc.toolName}(${JSON.stringify(tc.args)})]`,
          //     )
          //     .join('\n');
          //   assistantResponse += '\n' + toolCallsText;
          // }

          // Store assistant response in database
          if (assistantResponse) {
            await insertMessage(currentChatId, 'assistant', assistantResponse);
            await updateChatTimestamp(currentChatId);
          }

          // Send done signal with chat ID
          const doneData = `data: ${JSON.stringify({
            done: true,
            chatId: currentChatId,
          })}\n\n`;
          controller.enqueue(encoder.encode(doneData));
          controller.close();
        } catch (error) {
          console.error('Streaming error:', error);
          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return new Response('Internal server error', {status: 500});
  }
}

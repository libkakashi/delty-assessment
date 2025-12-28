import {z} from 'zod';
import Queue from 'superqueue';
import jju from 'jju';

import {streamText, generateText, type ModelMessage, type Tool} from 'ai';
import {google} from '@ai-sdk/google';
import {openai} from '@ai-sdk/openai';
import {anthropic} from '@ai-sdk/anthropic';

import {
  type ChatModel,
  isClaudeModel,
  isGeminiModel,
  isOpenAIModel,
} from './models';

export type ToolCall = {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
};

export type ToolResult = {
  toolCallId: string;
  toolName: string;
  result: unknown;
};

const getModel = (modelName: ChatModel) => {
  if (isGeminiModel(modelName)) {
    return google(modelName);
  } else if (isClaudeModel(modelName)) {
    return anthropic(modelName);
  } else if (isOpenAIModel(modelName)) {
    return openai(modelName);
  }
  throw new Error('Invalid model');
};

class LLMClient {
  #model: ChatModel;
  #temp: number;

  constructor(model: ChatModel, temp?: number) {
    this.#model = model;
    this.#temp = temp || 0.5;
  }

  async genText(messages: ModelMessage[] | string, temp?: number) {
    const model = getModel(this.#model);

    messages =
      typeof messages === 'string'
        ? [{role: 'user', content: messages}]
        : messages;

    const response = await generateText({
      model,
      messages,
      temperature: temp || this.#temp,
    });
    return response.text;
  }

  async genCodeBlock(messages: ModelMessage[] | string, temp?: number) {
    const output = (await this.genText(messages, temp)).trim();

    const trimmed = output.startsWith('```')
      ? output.slice(output.indexOf('\n'), -3).trim()
      : output;

    return trimmed;
  }

  genCodeBlockStream(messages: ModelMessage[] | string, temp?: number) {
    const queue = new Queue<string>();
    const model = getModel(this.#model);

    messages =
      typeof messages === 'string'
        ? [{role: 'user', content: messages}]
        : messages;

    const stream = streamText({
      model,
      messages,
      temperature: temp || this.#temp,
    });

    const data = async () => {
      let text = '';
      let state = 0;
      let nextPrefix = '';

      for await (const chunk of stream.textStream) {
        let content = chunk;

        if (state === 0 && chunk.startsWith('```')) {
          content = content.slice(3);
          state = 1;
        }
        if (state === 1) {
          content = content.trim();
          if (content) state = 2;
        }
        if (state === 2) {
          if (content.trimEnd().endsWith('```')) {
            const c = content.trimEnd().slice(0, -3);
            queue.push(nextPrefix + c);
            text += nextPrefix + c;
            nextPrefix = content.replace(c, '');
          } else {
            queue.push(nextPrefix + content);
            text += nextPrefix + content;
            nextPrefix = '';
          }
        }
      }
      queue.end();
      return text.trim();
    };
    return {queue, data};
  }

  async genTextStream(
    messages: ModelMessage[] | string,
    temp?: number,
    tools?: Record<string, Tool>,
  ) {
    console.log('Starting genTextStream with tools:', Object.keys(tools || {}));
    const queue = new Queue<string | ToolCall>();
    const model = getModel(this.#model);

    messages =
      typeof messages === 'string'
        ? [{role: 'user', content: messages}]
        : messages;

    const data = async () => {
      let allText = '';
      let currentMessages = [...messages];
      const maxIterations = 5;
      let iteration = 0;

      while (iteration < maxIterations) {
        iteration++;
        console.log(`Iteration ${iteration}`);

        const streamResult = streamText({
          model,
          messages: currentMessages,
          temperature: temp || this.#temp,
          tools,
        });

        // Stream text chunks
        for await (const chunk of streamResult.textStream) {
          console.log('text chunk');
          allText += chunk;
          queue.push(chunk);
        }

        // Wait for tool calls
        const toolCalls = await streamResult.toolCalls;

        if (toolCalls && toolCalls.length > 0) {
          console.log(`Executing ${toolCalls.length} tool calls`);

          // Push tool calls to queue for client notification
          for (const tc of toolCalls) {
            const toolCall: ToolCall = {
              toolCallId: tc.toolCallId,
              toolName: tc.toolName,
              args: tc.input as Record<string, unknown>,
            };
            queue.push(toolCall);
          }

          // Execute tools and collect results
          const toolResults: Array<{
            toolCallId: string;
            toolName: string;
            result: unknown;
          }> = [];

          for (const tc of toolCalls) {
            const tool = tools?.[tc.toolName];
            if (tool && tool.execute) {
              try {
                console.log(`Executing tool: ${tc.toolName}`);
                const result = await tool.execute(
                  tc.input as never,
                  {} as never,
                );
                toolResults.push({
                  toolCallId: tc.toolCallId,
                  toolName: tc.toolName,
                  result,
                });
              } catch (error) {
                console.error(`Error executing tool ${tc.toolName}:`, error);
                toolResults.push({
                  toolCallId: tc.toolCallId,
                  toolName: tc.toolName,
                  result: {error: String(error)},
                });
              }
            }
          }

          // Build next messages with tool results
          currentMessages = [
            ...currentMessages,
            {
              role: 'assistant' as const,
              content: toolCalls.map(tc => ({
                type: 'tool-call' as const,
                toolCallId: tc.toolCallId,
                toolName: tc.toolName,
                input: tc.input,
              })),
            } as unknown as ModelMessage,
            {
              role: 'tool' as const,
              content: toolResults.map(tr => ({
                type: 'tool-result' as const,
                toolCallId: tr.toolCallId,
                toolName: tr.toolName,
                output: JSON.stringify(tr.result),
              })),
            } as unknown as ModelMessage,
          ];

          // Continue to next iteration to get AI's response to tool results
          continue;
        } else {
          // No more tool calls, we're done
          console.log('No tool calls, finishing');
          break;
        }
      }

      queue.end();
      return {text: allText, toolCalls: []};
    };

    return {queue, data};
  }

  async genJson<T extends z.ZodType>(
    messages: ModelMessage[] | string,
    schema?: T,
    temp?: number,
  ): Promise<z.infer<T>> {
    const model = getModel(this.#model);

    messages =
      typeof messages === 'string'
        ? [{role: 'user', content: messages}]
        : messages;

    const {text} = await generateText({
      model,
      messages,
      temperature: temp || this.#temp,
    });
    const start = text.trim().indexOf('{');
    const end = text.trim().endsWith('```') ? -3 : text.length;

    const parsed = jju.parse(text.trim().slice(start, end));

    if (schema) {
      return schema.parse(parsed);
    }
    return parsed as z.infer<T>;
  }

  async genJsonStream<T extends z.ZodType>(
    messages: ModelMessage[] | string,
    schema?: T,
    temp?: number,
  ): Promise<{queue: Queue<string>; data: () => Promise<z.infer<T>>}> {
    const model = getModel(this.#model);

    messages =
      typeof messages === 'string'
        ? [{role: 'user', content: messages}]
        : messages;

    const stream = streamText({
      model,
      messages,
      temperature: temp || this.#temp,
    });
    const textStream = stream.textStream;
    const queue = new Queue<string>();

    const data = async () => {
      let text = '';
      let started = false;
      let nextPrefix = '';

      for await (const chunk of textStream) {
        let content = chunk.toString();

        if (!started) {
          const index = content.indexOf('{');
          if (index === -1) continue;
          content = content.slice(index);
          started = true;
        }

        if (content.trimEnd().endsWith('```')) {
          const c = content.trimEnd().slice(0, -3);
          queue.push(nextPrefix + c);
          text += nextPrefix + c;
          nextPrefix = content.replace(c, '');
        } else {
          queue.push(nextPrefix + content);
          text += nextPrefix + content;
          nextPrefix = '';
        }
      }
      queue.end();

      try {
        const parsed = JSON.parse(text);
        return schema ? schema.parse(parsed) : parsed;
      } catch (error) {
        console.error(text);
        throw new Error(`Failed to parse JSON: ${error}`);
      }
    };
    return {queue, data};
  }
}

export default LLMClient;

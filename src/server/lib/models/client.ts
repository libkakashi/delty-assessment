import {z} from 'zod';
import Queue from 'superqueue';
import jju from 'jju';

import {
  streamText,
  generateText,
  type ModelMessage,
  type ToolCallPart,
  type ToolResultPart,
} from 'ai';
import {google} from '@ai-sdk/google';
import {openai} from '@ai-sdk/openai';
import {anthropic} from '@ai-sdk/anthropic';

import {
  type ChatModel,
  isClaudeModel,
  isGeminiModel,
  isOpenAIModel,
} from './models';

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

    const formattedMessages: ModelMessage[] =
      typeof messages === 'string'
        ? [{role: 'user', content: messages}]
        : messages;

    const response = await generateText({
      model,
      messages: formattedMessages,
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

    const formattedMessages: ModelMessage[] =
      typeof messages === 'string'
        ? [{role: 'user', content: messages}]
        : messages;

    const stream = streamText({
      model,
      messages: formattedMessages,
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
    tools?: Parameters<typeof streamText>[0]['tools'],
    temp?: number,
  ) {
    console.log('[LLMClient] genTextStream called');
    console.log(
      '[LLMClient] tools provided:',
      tools ? Object.keys(tools) : 'none',
    );
    console.log('[LLMClient] temperature:', temp || this.#temp);

    const queue = new Queue<string | ToolCallPart | ToolResultPart>();
    const model = getModel(this.#model);

    const formattedMessages: ModelMessage[] =
      typeof messages === 'string'
        ? [{role: 'user', content: messages}]
        : messages;

    console.log(
      '[LLMClient] formatted messages count:',
      formattedMessages.length,
    );
    console.log(
      '[LLMClient] last message:',
      formattedMessages[formattedMessages.length - 1],
    );

    const stream = streamText({
      model,
      messages: formattedMessages,
      temperature: temp || this.#temp,
      ...(tools && {tools}),
    });

    console.log('[LLMClient] stream created, starting data processing');

    const data = async () => {
      console.log('[LLMClient] data() function started');
      let text = '';
      let chunkCount = 0;

      try {
        for await (const chunk of stream.fullStream) {
          chunkCount++;
          console.log(`[LLMClient] Chunk ${chunkCount} type:`, chunk.type);

          switch (chunk.type) {
            case 'text-delta':
              console.log('[LLMClient] text-delta:', chunk.text.slice(0, 50));
              text += chunk.text;
              queue.push(chunk.text);
              break;
            case 'tool-call':
              console.log(
                '[LLMClient] tool-call:',
                chunk.toolName,
                'callId:',
                chunk.toolCallId,
              );
              console.log(
                '[LLMClient] tool input:',
                JSON.stringify(chunk.input),
              );
              queue.push({
                type: 'tool-call',
                toolCallId: chunk.toolCallId,
                toolName: chunk.toolName,
                input: chunk.input,
              } as ToolCallPart);
              break;
            case 'tool-result':
              console.log(
                '[LLMClient] tool-result:',
                chunk.toolName,
                'callId:',
                chunk.toolCallId,
              );
              console.log(
                '[LLMClient] tool output:',
                JSON.stringify(chunk.output).slice(0, 100),
              );
              queue.push({
                type: 'tool-result',
                toolCallId: chunk.toolCallId,
                toolName: chunk.toolName,
                input: chunk.input,
                output: chunk.output,
              } as ToolResultPart);
              break;
            default:
              console.log(
                '[LLMClient] unknown chunk type:',
                (chunk as any).type,
              );
          }
        }

        console.log('[LLMClient] Stream completed. Total chunks:', chunkCount);
        console.log('[LLMClient] Total text length:', text.length);
      } catch (error) {
        console.error('[LLMClient] Error in stream processing:', error);
        throw error;
      }

      queue.end();
      console.log('[LLMClient] Queue ended');
      return text;
    };

    return {queue, data};
  }

  async genJson<T extends z.ZodType>(
    messages: ModelMessage[] | string,
    schema?: T,
    temp?: number,
  ): Promise<z.infer<T>> {
    const model = getModel(this.#model);

    const formattedMessages: ModelMessage[] =
      typeof messages === 'string'
        ? [{role: 'user', content: messages}]
        : messages;

    const {text} = await generateText({
      model,
      messages: formattedMessages,
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

    const formattedMessages: ModelMessage[] =
      typeof messages === 'string'
        ? [{role: 'user', content: messages}]
        : messages;

    const stream = streamText({
      model,
      messages: formattedMessages,
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
export type {ToolCallPart, ToolResultPart};

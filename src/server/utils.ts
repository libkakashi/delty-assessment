import type Queue from 'superqueue';
import type {ToolCallPart, ToolResultPart} from 'ai';

type StreamChunk = string | ToolCallPart | ToolResultPart;

export class EventSourceWriter extends TransformStream<string, string> {
  #index = 0;
  #queues: Queue<StreamChunk>[] = [];
  writer: WritableStreamDefaultWriter<string>;

  constructor() {
    super();
    this.writer = this.writable.getWriter();
  }

  addEventQueue = (queue: Queue<string>, label: string) => {
    void queue.mapParallel(async chunk => {
      const json = JSON.stringify({
        chunk: chunk.toString(),
        index: this.#index++,
      });
      await this.writer.write(`event: ${label}\n`);
      await this.writer.write(`data: ${json}\n\n`);
    }, 1);
    this.#queues.push(queue as Queue<StreamChunk>);
  };

  addMixedQueue = (
    queue: Queue<StreamChunk>,
    labels: {text: string; toolCall: string; toolResult: string},
  ) => {
    void queue.mapParallel(async chunk => {
      const index = this.#index++;

      if (typeof chunk === 'string') {
        // Text delta
        const json = JSON.stringify({
          chunk,
          index,
        });
        await this.writer.write(`event: ${labels.text}\n`);
        await this.writer.write(`data: ${json}\n\n`);
      } else if (chunk.type === 'tool-call') {
        // Tool call
        const json = JSON.stringify({
          chunk: {
            type: 'tool-call',
            toolCallId: chunk.toolCallId,
            toolName: chunk.toolName,
            input: chunk.input,
          },
          index,
        });
        await this.writer.write(`event: ${labels.toolCall}\n`);
        await this.writer.write(`data: ${json}\n\n`);
      } else if (chunk.type === 'tool-result') {
        // Tool result
        const json = JSON.stringify({
          chunk: {
            type: 'tool-result',
            toolCallId: chunk.toolCallId,
            toolName: chunk.toolName,
            output: chunk.output,
          },
          index,
        });
        await this.writer.write(`event: ${labels.toolResult}\n`);
        await this.writer.write(`data: ${json}\n\n`);
      }
    }, 1);
    this.#queues.push(queue);
  };

  sendEvent = async (label: string, data: object) => {
    const json = JSON.stringify({
      ...data,
      index: this.#index++,
    });
    await this.writer.write(`event: ${label}\n`);
    await this.writer.write(`data: ${json}\n\n`);
  };

  flush = async () => {
    if (!this.#queues.every(queue => queue.ended)) {
      throw new Error('All queues have not ended');
    }
    await this.writer.write('event: done\n');
    await this.writer.write('data: [DONE]\n\n');
    this.writer.releaseLock();
  };

  close() {
    return this.writable.close();
  }
}

export const toSSEStream = (queue: Queue<string>) => {
  const writer = new EventSourceWriter();
  writer.addEventQueue(queue, 'message');
  return writer;
};

export const toMixedSSEStream = (queue: Queue<StreamChunk>) => {
  const writer = new EventSourceWriter();
  writer.addMixedQueue(queue, {
    text: 'text',
    toolCall: 'tool-call',
    toolResult: 'tool-result',
  });
  return writer;
};

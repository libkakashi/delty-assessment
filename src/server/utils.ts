import type Queue from 'superqueue';

export class EventSourceWriter extends TransformStream<string, string> {
  #index = 0;
  #queues: Queue<string>[] = [];
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
    this.#queues.push(queue);
  };

  flush = async () => {
    if (!this.#queues.every(queue => queue.ended)) {
      throw new Error('All queues have not ended');
    }
    await this.writer.write('[DONE]\n\n');
    this.writer.releaseLock();
  };

  close() {
    return this.writable.close();
  }
}

export const toSSEStream = (queue: Queue<string>) => {
  const writer = new EventSourceWriter();
  writer.addEventQueue(queue, 'queue');
  return writer;
};

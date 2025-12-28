import {fetchEventSource} from '@microsoft/fetch-event-source';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatStreamOptions {
  messages: Message[];
  onChunk?: (chunk: string) => void;
  onComplete?: (fullText: string) => void;
  onError?: (error: Error) => void;
  signal?: AbortSignal;
}

class RetriableError extends Error {}
class FatalError extends Error {}

export async function streamChat({
  messages,
  onChunk,
  onComplete,
  onError,
  signal,
}: ChatStreamOptions): Promise<void> {
  let fullText = '';

  try {
    await fetchEventSource('/api/chat', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({messages}),
      keepalive: true,
      openWhenHidden: true,
      signal,
      async onopen(response) {
        console.log('here', response);
        if (response.ok) {
          return; // everything's good
        } else if (
          response.status >= 400 &&
          response.status < 500 &&
          response.status !== 429
        ) {
          // client-side errors are usually non-retriable:
          const error = await response.text();
          throw new FatalError(`Client error: ${error}`);
        } else {
          throw new RetriableError(`Server error: ${response.status}`);
        }
      },
      onmessage(event) {
        if (event.data === '[DONE]') {
          onComplete?.(fullText);
          return;
        }

        try {
          const parsed = JSON.parse(event.data);
          if (parsed.content) {
            fullText += parsed.content;
            onChunk?.(parsed.content);
          }
        } catch (error) {
          console.error('Failed to parse SSE message:', error);
        }
      },
      onerror(error) {
        if (error instanceof FatalError) {
          throw error; // rethrow to stop the fetch
        }
        // Retriable errors will be retried automatically
        throw error;
      },
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    onError?.(err);
    throw err;
  }
}

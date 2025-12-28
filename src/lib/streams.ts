import {fetchEventSource} from '@microsoft/fetch-event-source';

export interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ToolInvocation {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  state: 'call' | 'result' | 'error';
  result?: unknown;
}

export interface StreamCallbacks {
  onTextDelta?: (delta: string) => void;
  onToolCall?: (toolInvocation: ToolInvocation) => void;
  onToolResult?: (toolInvocation: ToolInvocation) => void;
  onError?: (error: Error) => void;
  onComplete?: (chatId: string | null) => void;
}

export interface StreamResult {
  chatId: string | null;
}

/**
 * Send a chat request and process the streaming response using fetchEventSource
 * Handles EventSourceWriter format with event labels: text, tool-call, tool-result, meta, done, error
 */
export async function sendChatStream(
  messages: AIMessage[],
  chatId: string | null,
  callbacks: StreamCallbacks,
  abortSignal?: AbortSignal,
): Promise<StreamResult> {
  const toolInvocationsMap = new Map<string, ToolInvocation>();
  let resultChatId: string | null = chatId;
  const processed: {[key: number]: boolean | undefined} = {};

  return new Promise<StreamResult>((resolve, reject) => {
    const controller = new AbortController();
    let rejected = false;

    // Link external abort signal if provided
    if (abortSignal) {
      abortSignal.addEventListener('abort', () => controller.abort());
    }

    void fetchEventSource('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages,
        chatId,
      }),
      signal: controller.signal,
      openWhenHidden: true,

      async onopen(response) {
        if (!response.ok) {
          const errorText = await response.text();
          const error = new Error(
            `HTTP error! status: ${response.status}, message: ${errorText}`,
          );
          callbacks.onError?.(error);
          reject(error);
          controller.abort();
          rejected = true;
          return;
        }

        // Try to get chat ID from headers
        const headerChatId = response.headers.get('X-Chat-Id');
        if (headerChatId) {
          resultChatId = headerChatId;
        }
      },

      onmessage(event) {
        if (rejected) return;
        if (!event.data) return;

        // Handle done event
        if (event.event === 'done') {
          callbacks.onComplete?.(resultChatId);
          resolve({chatId: resultChatId});
          return;
        }

        try {
          const data = JSON.parse(event.data);

          // Dedupe by index
          if (data.index !== undefined && processed[data.index]) {
            return;
          }
          if (data.index !== undefined) {
            processed[data.index] = true;
          }

          switch (event.event) {
            case 'text': {
              // Text delta from EventSourceWriter: { chunk: string, index: number }
              const text = data.chunk;
              if (typeof text === 'string') {
                callbacks.onTextDelta?.(text);
              }
              break;
            }

            case 'tool-call': {
              // Tool call: { chunk: { type, toolCallId, toolName, input }, index }
              const chunk = data.chunk;
              if (chunk && chunk.toolCallId) {
                const toolInvocation: ToolInvocation = {
                  toolCallId: chunk.toolCallId,
                  toolName: chunk.toolName,
                  args: chunk.input ?? {},
                  state: 'call',
                };
                toolInvocationsMap.set(chunk.toolCallId, toolInvocation);
                callbacks.onToolCall?.(toolInvocation);
              }
              break;
            }

            case 'tool-result': {
              // Tool result: { chunk: { type, toolCallId, toolName, output }, index }
              const chunk = data.chunk;
              if (chunk && chunk.toolCallId) {
                const existing = toolInvocationsMap.get(chunk.toolCallId);
                if (existing) {
                  existing.state = 'result';
                  existing.result = chunk.output;
                  callbacks.onToolResult?.(existing);
                } else {
                  // Create new tool invocation for orphaned results
                  const toolInvocation: ToolInvocation = {
                    toolCallId: chunk.toolCallId,
                    toolName: chunk.toolName,
                    args: {},
                    state: 'result',
                    result: chunk.output,
                  };
                  toolInvocationsMap.set(chunk.toolCallId, toolInvocation);
                  callbacks.onToolResult?.(toolInvocation);
                }
              }
              break;
            }

            case 'meta': {
              // Meta event with chatId
              if (data.chatId) {
                resultChatId = String(data.chatId);
              }
              break;
            }

            case 'error': {
              const error = new Error(data.message || 'Stream error');
              callbacks.onError?.(error);
              reject(error);
              rejected = true;
              break;
            }
          }
        } catch (e) {
          console.error('[streams] Error parsing SSE data:', e, event.data);
        }
      },

      onerror(error) {
        if (rejected) return;
        console.error('[streams] SSE error:', error);
        callbacks.onError?.(
          error instanceof Error ? error : new Error('Stream error'),
        );
        // Throw to stop retrying
        throw error;
      },

      onclose() {
        // Stream closed - resolve if not already done
        if (!rejected) {
          resolve({chatId: resultChatId});
        }
      },
    });
  });
}

/**
 * Helper to get all tool invocations from a map as an array
 */
export function getToolInvocationsArray(
  toolInvocationsMap: Map<string, ToolInvocation>,
): ToolInvocation[] {
  return Array.from(toolInvocationsMap.values());
}

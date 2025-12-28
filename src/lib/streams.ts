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
 */
export async function sendChatStream(
  messages: AIMessage[],
  chatId: string | null,
  callbacks: StreamCallbacks,
  abortSignal?: AbortSignal,
): Promise<StreamResult> {
  const toolInvocationsMap = new Map<string, ToolInvocation>();
  let resultChatId: string | null = chatId;

  return new Promise<StreamResult>((resolve, reject) => {
    const controller = new AbortController();

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
          return;
        }

        // Try to get chat ID from headers
        const headerChatId = response.headers.get('X-Chat-Id');
        if (headerChatId) {
          resultChatId = headerChatId;
        }
      },

      onmessage(event) {
        if (!event.data) return;

        try {
          const data = JSON.parse(event.data);

          switch (data.type) {
            case 'text-delta': {
              callbacks.onTextDelta?.(data.text);
              break;
            }

            case 'tool-call': {
              const toolInvocation: ToolInvocation = {
                toolCallId: data.toolCallId,
                toolName: data.toolName,
                args: data.input ?? {},
                state: 'call',
              };
              toolInvocationsMap.set(data.toolCallId, toolInvocation);
              callbacks.onToolCall?.(toolInvocation);
              break;
            }

            case 'tool-result': {
              const existing = toolInvocationsMap.get(data.toolCallId);
              if (existing) {
                existing.state = 'result';
                existing.result = data.output;
                callbacks.onToolResult?.(existing);
              } else {
                // Create new tool invocation for orphaned results
                const toolInvocation: ToolInvocation = {
                  toolCallId: data.toolCallId,
                  toolName: data.toolName,
                  args: data.input ?? {},
                  state: 'result',
                  result: data.output,
                };
                toolInvocationsMap.set(data.toolCallId, toolInvocation);
                callbacks.onToolResult?.(toolInvocation);
              }
              break;
            }

            case 'done': {
              if (data.chatId) {
                resultChatId = String(data.chatId);
              }
              callbacks.onComplete?.(resultChatId);
              resolve({chatId: resultChatId});
              break;
            }

            case 'error': {
              const error = new Error(data.message || 'Stream error');
              callbacks.onError?.(error);
              reject(error);
              break;
            }
          }
        } catch (e) {
          console.error('[streams] Error parsing SSE data:', e, event.data);
        }
      },

      onerror(error) {
        console.error('[streams] SSE error:', error);
        callbacks.onError?.(
          error instanceof Error ? error : new Error('Stream error'),
        );
        // Don't reject here - let fetchEventSource retry or close naturally
        throw error; // This tells fetchEventSource to stop retrying
      },

      onclose() {
        // Stream closed without 'done' event - resolve anyway
        resolve({chatId: resultChatId});
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

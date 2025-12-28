'use client';

import {useState, useRef, useEffect, useCallback} from 'react';
import {
  Paperclip,
  Send,
  X,
  FileText,
  Loader2,
  MessageSquare,
  Plus,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';

import {Button} from '~/components/ui/button';
import {Input} from '~/components/ui/input';
import {ScrollArea} from '~/components/ui/scroll-area';
import {Avatar, AvatarFallback} from '~/components/ui/avatar';
import {
  sendChatStream,
  type ToolInvocation,
  type StreamCallbacks,
} from '~/lib/streams';

// ============================================================================
// Types & Interfaces
// ============================================================================

interface AttachedDocument {
  id: string;
  name: string;
  size: number;
  type: string;
}

// Re-export ToolInvocation type from streams for use in components
export type {ToolInvocation} from '~/lib/streams';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolInvocations?: ToolInvocation[];
}

interface ChatSidebarProps {
  className?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function generateId(): string {
  return Date.now().toString();
}

function createUserMessage(content: string): Message {
  return {
    id: generateId(),
    role: 'user',
    content,
  };
}

function createErrorMessage(): Message {
  return {
    id: (Date.now() + 1).toString(),
    role: 'assistant',
    content:
      'Sorry, there was an error processing your request. Please try again.',
  };
}

function buildApiMessages(
  messages: Message[],
): {role: 'user' | 'assistant' | 'system'; content: string}[] {
  return messages.map(msg => ({
    role: msg.role,
    content: msg.content,
  }));
}

// ============================================================================
// LocalStorage Utilities
// ============================================================================

function loadChatFromStorage(): number | null {
  try {
    const savedChat = localStorage.getItem('currentChat');
    if (savedChat) {
      const parsed = JSON.parse(savedChat);
      return parsed.chatId;
    }
  } catch (error) {
    console.error('Failed to load chat from localStorage:', error);
  }
  return null;
}

function saveChatToStorage(chatId: number | null): void {
  if (chatId) {
    localStorage.setItem('currentChat', JSON.stringify({chatId}));
  }
}

function clearChatFromStorage(): void {
  localStorage.removeItem('currentChat');
}

// ============================================================================
// Component Functions
// ============================================================================

function NewThreadButton({onClick}: {onClick: () => void}) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      className="flex items-center gap-1"
    >
      <Plus className="h-4 w-4" />
      <span className="text-xs">New Chat</span>
    </Button>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center text-center text-muted-foreground">
      <div className="space-y-2">
        <MessageSquare className="mx-auto h-12 w-12 opacity-50" />
        <p className="text-sm">Start a conversation</p>
        <p className="text-xs">
          Try asking me to create, list, or manage your documents
        </p>
      </div>
    </div>
  );
}

function LoadingIndicator() {
  return (
    <div className="flex gap-3">
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback className="bg-primary text-primary-foreground">
          AI
        </AvatarFallback>
      </Avatar>
      <div className="flex items-center gap-2 rounded-lg bg-muted px-4 py-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm text-muted-foreground">Thinking...</span>
      </div>
    </div>
  );
}

function ToolInvocationCard({
  toolInvocation,
}: {
  toolInvocation: ToolInvocation;
}) {
  return (
    <div className="w-full rounded-lg border bg-card p-3 text-card-foreground shadow-sm">
      {/* Tool Header */}
      <div className="mb-2 flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          {toolInvocation.state === 'call' && (
            <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
          )}
          {toolInvocation.state === 'result' && (
            <CheckCircle className="h-4 w-4 text-green-500" />
          )}
          {toolInvocation.state === 'error' && (
            <AlertCircle className="h-4 w-4 text-red-500" />
          )}
          <span className="text-xs font-semibold">
            {toolInvocation.toolName}
          </span>
        </div>
      </div>

      {/* Tool Input */}
      <div className="mb-2 rounded bg-muted/50 p-2">
        <p className="mb-1 text-xs font-medium text-muted-foreground">Input:</p>
        <pre className="overflow-x-auto text-xs">
          {typeof toolInvocation.args === 'string'
            ? toolInvocation.args
            : JSON.stringify(toolInvocation.args, null, 2)}
        </pre>
      </div>

      {/* Tool Result */}
      {toolInvocation.state === 'result' &&
        toolInvocation.result !== undefined && (
          <div className="rounded bg-muted/50 p-2">
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              Result:
            </p>
            <pre className="overflow-x-auto text-xs">
              {(() => {
                try {
                  return typeof toolInvocation.result === 'string'
                    ? toolInvocation.result
                    : JSON.stringify(toolInvocation.result, null, 2);
                } catch {
                  return String(toolInvocation.result);
                }
              })()}
            </pre>
          </div>
        )}
    </div>
  );
}

function MessageBubble({message}: {message: Message}) {
  return (
    <div
      key={message.id}
      className={`flex gap-3 ${
        message.role === 'user' ? 'justify-end' : 'justify-start'
      }`}
    >
      {message.role === 'assistant' && (
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback className="bg-primary text-primary-foreground">
            AI
          </AvatarFallback>
        </Avatar>
      )}

      <div
        className={`flex max-w-[80%] flex-col gap-2 ${
          message.role === 'user' ? 'items-end' : 'items-start'
        }`}
      >
        {/* Render text content */}
        {message.content && (
          <div
            className={`rounded-lg px-4 py-2 ${
              message.role === 'user'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted'
            }`}
          >
            <p className="whitespace-pre-wrap text-sm">{message.content}</p>
          </div>
        )}

        {/* Render tool invocations */}
        {message.toolInvocations?.map(toolInvocation => (
          <ToolInvocationCard
            key={toolInvocation.toolCallId}
            toolInvocation={toolInvocation}
          />
        ))}
      </div>

      {message.role === 'user' && (
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback className="bg-secondary text-secondary-foreground">
            U
          </AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}

function AttachedDocumentsList({
  documents,
  onRemove,
}: {
  documents: AttachedDocument[];
  onRemove: (id: string) => void;
}) {
  if (documents.length === 0) return null;

  return (
    <div className="border-t bg-muted/50 p-2">
      <div className="flex flex-wrap gap-2">
        {documents.map(doc => (
          <div
            key={doc.id}
            className="flex items-center gap-2 rounded-md bg-background px-3 py-1 text-sm"
          >
            <FileText className="h-4 w-4" />
            <span className="max-w-37.5 truncate">{doc.name}</span>
            <button
              onClick={() => onRemove(doc.id)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function ChatSidebar({className = ''}: ChatSidebarProps) {
  // State
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [attachedDocuments, setAttachedDocuments] = useState<
    AttachedDocument[]
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const [chatId, setChatId] = useState<number | null>(null);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // ============================================================================
  // Effects
  // ============================================================================

  // Load chat from localStorage on mount
  useEffect(() => {
    const savedChatId = loadChatFromStorage();
    if (savedChatId) {
      setChatId(savedChatId);
    }
  }, []);

  // Save chat to localStorage whenever chatId changes
  useEffect(() => {
    saveChatToStorage(chatId);
  }, [chatId]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

  // ============================================================================
  // Event Handlers
  // ============================================================================

  const handleNewThread = () => {
    if (isLoading && abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    setMessages([]);
    setChatId(null);
    setInput('');
    setAttachedDocuments([]);
    clearChatFromStorage();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newDocuments: AttachedDocument[] = Array.from(files).map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      name: file.name,
      size: file.size,
      type: file.type,
    }));

    setAttachedDocuments(prev => [...prev, ...newDocuments]);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeDocument = (id: string) => {
    setAttachedDocuments(prev => prev.filter(doc => doc.id !== id));
  };

  // Mutable refs to track streaming state without causing re-renders
  const streamingContentRef = useRef('');
  const toolInvocationsMapRef = useRef(new Map<string, ToolInvocation>());

  // Create stream callbacks using useCallback to avoid recreating on every render
  const createStreamCallbacks = useCallback((): StreamCallbacks => {
    return {
      onTextDelta: (delta: string) => {
        streamingContentRef.current += delta;
        const currentContent = streamingContentRef.current;
        const currentTools = Array.from(toolInvocationsMapRef.current.values());

        setMessages(prev => {
          const newMessages = [...prev];
          const lastMsg = newMessages[newMessages.length - 1];
          if (lastMsg?.role === 'assistant') {
            lastMsg.content = currentContent;
            lastMsg.toolInvocations = currentTools;
          } else {
            newMessages.push({
              id: (Date.now() + 1).toString(),
              role: 'assistant',
              content: currentContent,
              toolInvocations: currentTools,
            });
          }
          return newMessages;
        });
      },

      onToolCall: (toolInvocation: ToolInvocation) => {
        toolInvocationsMapRef.current.set(
          toolInvocation.toolCallId,
          toolInvocation,
        );
        const currentContent = streamingContentRef.current;
        const currentTools = Array.from(toolInvocationsMapRef.current.values());

        setMessages(prev => {
          const newMessages = [...prev];
          const lastMsg = newMessages[newMessages.length - 1];
          if (lastMsg?.role === 'assistant') {
            lastMsg.content = currentContent;
            lastMsg.toolInvocations = currentTools;
          } else {
            newMessages.push({
              id: (Date.now() + 1).toString(),
              role: 'assistant',
              content: currentContent,
              toolInvocations: currentTools,
            });
          }
          return newMessages;
        });
      },

      onToolResult: (toolInvocation: ToolInvocation) => {
        toolInvocationsMapRef.current.set(
          toolInvocation.toolCallId,
          toolInvocation,
        );
        const currentContent = streamingContentRef.current;
        const currentTools = Array.from(toolInvocationsMapRef.current.values());

        setMessages(prev => {
          const newMessages = [...prev];
          const lastMsg = newMessages[newMessages.length - 1];
          if (lastMsg?.role === 'assistant') {
            lastMsg.content = currentContent;
            lastMsg.toolInvocations = currentTools;
          } else {
            newMessages.push({
              id: (Date.now() + 1).toString(),
              role: 'assistant',
              content: currentContent,
              toolInvocations: currentTools,
            });
          }
          return newMessages;
        });
      },

      onError: (error: Error) => {
        console.error('[CLIENT] Stream error:', error);
      },

      onComplete: (newChatId: string | null) => {
        console.log('[CLIENT] Stream complete, chatId:', newChatId);
        // Update chat ID if we got a new one
        if (newChatId && !chatId) {
          setChatId(parseInt(newChatId, 10));
        }
      },
    };
  }, [chatId]);

  const handleSendMessage = async () => {
    console.log('[CLIENT] handleSendMessage called');

    if (!input.trim() || isLoading) {
      console.log('[CLIENT] Aborted: empty input or already loading');
      return;
    }

    const userMessage = createUserMessage(input);
    console.log('[CLIENT] User message created:', userMessage);

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // Reset streaming state
    streamingContentRef.current = '';
    toolInvocationsMapRef.current = new Map<string, ToolInvocation>();

    abortControllerRef.current = new AbortController();

    try {
      const allMessages = [...messages, userMessage];
      const apiMessages = buildApiMessages(allMessages);

      const callbacks = createStreamCallbacks();

      await sendChatStream(
        apiMessages,
        chatId?.toString() ?? null,
        callbacks,
        abortControllerRef.current.signal,
      );

      setAttachedDocuments([]);
      console.log('[CLIENT] Message handling complete');
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('[CLIENT] Request aborted');
      } else {
        console.error('[CLIENT] Error sending message:', error);
        console.error(
          '[CLIENT] Error stack:',
          error instanceof Error ? error.stack : 'no stack',
        );
        const errorMessage = createErrorMessage();
        setMessages(prev => [...prev, errorMessage]);
      }
    } finally {
      console.log('[CLIENT] Finally block - setting isLoading to false');
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSendMessage();
    }
  };

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className={`flex h-[90vh] flex-col bg-background ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b p-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Chat Assistant</h1>
        </div>
        <NewThreadButton onClick={handleNewThread} />
      </div>

      {/* Messages Area */}
      <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
        <div className="space-y-4">
          {messages.length === 0 && <EmptyState />}

          {messages.map(message => (
            <MessageBubble key={message.id} message={message} />
          ))}

          {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
            <LoadingIndicator />
          )}
        </div>
      </ScrollArea>

      {/* Attached Documents */}
      <AttachedDocumentsList
        documents={attachedDocuments}
        onRemove={removeDocument}
      />

      {/* Input Area */}
      <div className="border-t p-4">
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
          >
            <Paperclip className="h-4 w-4" />
          </Button>

          <Input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Type your message..."
            disabled={isLoading}
            className="flex-1"
          />

          <Button
            onClick={handleSendMessage}
            size="icon"
            disabled={isLoading || !input.trim()}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

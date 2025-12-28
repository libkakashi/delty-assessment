'use client';

import {useState, useRef, useEffect} from 'react';
import {
  Paperclip,
  Send,
  X,
  FileText,
  Loader2,
  Wrench,
  CheckCircle,
  XCircle,
  MessageSquare,
  Plus,
} from 'lucide-react';

import {Button} from '~/components/ui/button';
import {Input} from '~/components/ui/input';

import {ScrollArea} from '~/components/ui/scroll-area';
import {Avatar, AvatarFallback} from '~/components/ui/avatar';
import {Badge} from '~/components/ui/badge';

interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status?: 'pending' | 'success' | 'error';
  result?: unknown;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  toolCalls?: ToolCall[];
}

interface AttachedDocument {
  id: string;
  name: string;
  size: number;
  type: string;
}

interface ChatSidebarProps {
  className?: string;
}

// Component for creating a new chat thread
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

export default function ChatSidebar({className = ''}: ChatSidebarProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [attachedDocuments, setAttachedDocuments] = useState<
    AttachedDocument[]
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const [chatId, setChatId] = useState<number | null>(null);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingToolCalls, setStreamingToolCalls] = useState<ToolCall[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load chat from localStorage on mount
  useEffect(() => {
    const savedChat = localStorage.getItem('currentChat');
    if (savedChat) {
      try {
        const parsed = JSON.parse(savedChat);
        setMessages(
          parsed.messages.map((msg: Message) => ({
            ...msg,
            timestamp: new Date(msg.timestamp),
          })),
        );
        setChatId(parsed.chatId);
      } catch (error) {
        console.error('Failed to load chat from localStorage:', error);
      }
    }
  }, []);

  // Save chat to localStorage whenever messages or chatId changes
  useEffect(() => {
    if (messages.length > 0 || chatId) {
      localStorage.setItem('currentChat', JSON.stringify({messages, chatId}));
    }
  }, [messages, chatId]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages, streamingContent, streamingToolCalls]);

  // Handle creating a new thread
  const handleNewThread = () => {
    if (isLoading) return;

    // Clear current chat state
    setMessages([]);
    setInput('');
    setAttachedDocuments([]);
    setChatId(null);
    setStreamingContent('');
    setStreamingToolCalls([]);

    // Clear localStorage
    localStorage.removeItem('currentChat');

    // Abort any ongoing requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newDocuments: AttachedDocument[] = Array.from(files).map(file => ({
      id: Math.random().toString(36).substring(7),
      name: file.name,
      size: file.size,
      type: file.type,
    }));

    setAttachedDocuments(prev => [...prev, ...newDocuments]);

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeDocument = (id: string) => {
    setAttachedDocuments(prev => prev.filter(doc => doc.id !== id));
  };

  const handleSendMessage = async () => {
    if (!input.trim() && attachedDocuments.length === 0) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    const currentMessages = [...messages, userMessage];
    setMessages(currentMessages);
    setInput('');
    setIsLoading(true);
    setStreamingContent('');
    setStreamingToolCalls([]);

    // Create abort controller for this request
    abortControllerRef.current = new AbortController();

    try {
      // Format messages for API
      const apiMessages = currentMessages.map(msg => ({
        role: msg.role,
        content: msg.content,
      }));

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: apiMessages,
          chatId: chatId,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No reader available');
      }

      let accumulatedContent = '';
      let newChatId = chatId;
      const collectedToolCalls: ToolCall[] = [];

      while (true) {
        const {done, value} = await reader.read();

        if (done) break;

        const chunk = decoder.decode(value, {stream: true});
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);

            if (data === '[DONE]') {
              continue;
            }

            try {
              const parsed = JSON.parse(data);

              if (parsed.type === 'text' && parsed.content) {
                accumulatedContent += parsed.content;
                setStreamingContent(accumulatedContent);
              }

              if (parsed.type === 'tool_call' && parsed.toolCall) {
                const toolCall: ToolCall = {
                  id: parsed.toolCall.id,
                  name: parsed.toolCall.name,
                  args: parsed.toolCall.args,
                  status: parsed.toolCall.status || 'success',
                  result: parsed.toolCall.result,
                };
                collectedToolCalls.push(toolCall);
                setStreamingToolCalls([...collectedToolCalls]);
              }

              if (parsed.chatId && !newChatId) {
                newChatId = parsed.chatId;
                setChatId(parsed.chatId);
              }

              if (parsed.done) {
                // Finalize the assistant message with tool calls from backend
                const assistantMessage: Message = {
                  id: (Date.now() + 1).toString(),
                  role: 'assistant',
                  content: accumulatedContent,
                  timestamp: new Date(),
                  toolCalls:
                    collectedToolCalls.length > 0
                      ? collectedToolCalls
                      : undefined,
                };
                setMessages(prev => [...prev, assistantMessage]);
                setStreamingContent('');
                setStreamingToolCalls([]);
              }
            } catch (e) {
              console.error('Error parsing SSE data:', e);
            }
          }
        }
      }

      setAttachedDocuments([]);
    } catch (error: unknown) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          console.log('Request aborted');
        } else {
          console.error('Error sending message:', error);
          // Show error message to user
          const errorMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content:
              'Sorry, there was an error processing your request. Please try again.',
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, errorMessage]);
        }
      }
      setStreamingContent('');
      setStreamingToolCalls([]);
    } finally {
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return (
    <div className={`flex flex-col h-full border-l bg-background ${className}`}>
      <div className="p-4 border-b">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            <h2 className="text-lg font-semibold">AI Assistant</h2>
          </div>
          <NewThreadButton onClick={handleNewThread} />
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Ask questions about your documents
        </p>
        {chatId && (
          <p className="text-xs text-muted-foreground mt-1">
            Chat ID: {chatId}
          </p>
        )}
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full p-4" ref={scrollAreaRef}>
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="text-center px-4">
                <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-sm mb-2">No messages yet</p>
                <p className="text-xs">Start a conversation by typing below</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map(message => (
                <div key={message.id}>
                  <div
                    className={`flex gap-2 ${
                      message.role === 'user' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    {message.role === 'assistant' && (
                      <Avatar className="h-7 w-7 flex-shrink-0">
                        <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                          AI
                        </AvatarFallback>
                      </Avatar>
                    )}
                    <div
                      className={`rounded-lg px-3 py-2 max-w-[85%] ${
                        message.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap break-words">
                        {message.content}
                      </p>
                      <p className="text-xs mt-1 opacity-70">
                        {message.timestamp.toLocaleTimeString()}
                      </p>
                    </div>
                    {message.role === 'user' && (
                      <Avatar className="h-7 w-7 flex-shrink-0">
                        <AvatarFallback className="bg-secondary text-xs">
                          You
                        </AvatarFallback>
                      </Avatar>
                    )}
                  </div>
                  {/* Tool calls for this message */}
                  {message.toolCalls && message.toolCalls.length > 0 && (
                    <div className="ml-9 mt-2 space-y-2">
                      {message.toolCalls.map(toolCall => (
                        <div
                          key={toolCall.id}
                          className="bg-secondary/50 rounded-lg px-3 py-2 text-xs max-w-[85%]"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <Wrench className="h-3 w-3" />
                            <span className="font-medium">{toolCall.name}</span>
                            {toolCall.status === 'success' && (
                              <CheckCircle className="h-3 w-3 text-green-600" />
                            )}
                            {toolCall.status === 'error' && (
                              <XCircle className="h-3 w-3 text-red-600" />
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground space-y-1">
                            <div className="break-all">
                              <strong>Args:</strong>{' '}
                              {JSON.stringify(toolCall.args)}
                            </div>
                            {toolCall.result ? (
                              <div className="break-all">
                                <strong>Result:</strong>{' '}
                                {JSON.stringify(toolCall.result)}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {/* Streaming message */}
              {streamingContent && (
                <div>
                  <div className="flex gap-2 justify-start">
                    <Avatar className="h-7 w-7 flex-shrink-0">
                      <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                        AI
                      </AvatarFallback>
                    </Avatar>
                    <div className="rounded-lg px-3 py-2 max-w-[85%] bg-muted">
                      <p className="text-sm whitespace-pre-wrap break-words">
                        {streamingContent}
                      </p>
                      <p className="text-xs mt-1 opacity-70">Typing...</p>
                    </div>
                  </div>
                  {/* Streaming tool calls */}
                  {streamingToolCalls.length > 0 && (
                    <div className="ml-9 mt-2 space-y-2">
                      {streamingToolCalls.map(toolCall => (
                        <div
                          key={toolCall.id}
                          className="bg-secondary/50 rounded-lg px-3 py-2 text-xs max-w-[85%]"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <Wrench className="h-3 w-3" />
                            <span className="font-medium">{toolCall.name}</span>
                            {toolCall.status === 'success' && (
                              <CheckCircle className="h-3 w-3 text-green-600" />
                            )}
                            {toolCall.status === 'error' && (
                              <XCircle className="h-3 w-3 text-red-600" />
                            )}
                            {toolCall.status === 'pending' && (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground space-y-1">
                            <div className="break-all">
                              <strong>Args:</strong>{' '}
                              {JSON.stringify(toolCall.args)}
                            </div>
                            {toolCall.result ? (
                              <div className="break-all">
                                <strong>Result:</strong>{' '}
                                {JSON.stringify(toolCall.result)}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {/* Loading indicator */}
              {isLoading && !streamingContent && (
                <div className="flex gap-2 justify-start">
                  <Avatar className="h-7 w-7 flex-shrink-0">
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                      AI
                    </AvatarFallback>
                  </Avatar>
                  <div className="rounded-lg px-3 py-2 bg-muted">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Attached Documents */}
      {attachedDocuments.length > 0 && (
        <div className="px-4 pb-2">
          <div className="flex flex-wrap gap-2">
            {attachedDocuments.map(doc => (
              <Badge
                key={doc.id}
                variant="secondary"
                className="flex items-center gap-1 px-2 py-1 text-xs"
              >
                <FileText className="h-3 w-3" />
                <span className="truncate max-w-[120px]">{doc.name}</span>
                <button
                  onClick={() => removeDocument(doc.id)}
                  className="ml-1 hover:bg-secondary-foreground/20 rounded-full p-0.5"
                >
                  <X className="h-2 w-2" />
                </button>
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="p-4 border-t">
        <div className="flex gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            multiple
            className="hidden"
            accept=".pdf,.doc,.docx,.txt,.md"
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className="flex-shrink-0"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <Input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type a message..."
            disabled={isLoading}
            className="flex-1"
          />
          <Button
            onClick={handleSendMessage}
            disabled={
              isLoading || (!input.trim() && attachedDocuments.length === 0)
            }
            size="icon"
            className="flex-shrink-0"
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

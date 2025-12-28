export enum ClaudeChatModel {
  OPUS = 'claude-opus-4-0',
  SONNET = 'claude-sonnet-4-0',
}

export enum GeminiChatModel {
  PRO = 'gemini-2.5-pro',
  FLASH_LITE = 'gemini-2.0-flash-lite',
  FLASH = 'gemini-2.0-flash',
}

export enum OpenAIChatModel {
  GPT41 = 'gpt-4.1-2025-04-14',
}

export type ChatModel = OpenAIChatModel | ClaudeChatModel | GeminiChatModel;

export function isOpenAIModel(model: ChatModel): model is OpenAIChatModel {
  return Object.values(OpenAIChatModel).includes(model as OpenAIChatModel);
}

export function isClaudeModel(model: ChatModel): model is ClaudeChatModel {
  return Object.values(ClaudeChatModel).includes(model as ClaudeChatModel);
}

export function isGeminiModel(model: ChatModel): model is GeminiChatModel {
  return Object.values(GeminiChatModel).includes(model as GeminiChatModel);
}

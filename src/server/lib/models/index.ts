import LLMClient from './client';
import {ClaudeChatModel, GeminiChatModel} from './models';

// export const major = new LLMClient(OpenAIChatModel.GPT41);
// export const major = new LLMClient(GeminiChatModel.PRO);
export const major = new LLMClient(ClaudeChatModel.SONNET);
export const minor = new LLMClient(ClaudeChatModel.SONNET);
export const extraMinor = new LLMClient(GeminiChatModel.FLASH);

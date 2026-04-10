import { api } from "./client";

export interface ChatResponse {
  response: string;
  history: Record<string, unknown>[];
}

export async function sendMessage(
  message: string,
  history: Record<string, unknown>[] = [],
): Promise<ChatResponse> {
  return api.post<ChatResponse>("/agent/chat", { message, history });
}

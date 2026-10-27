import type { ChatMessage } from '../realtime/tableSocket';
import { api } from './client';
import type { TableView } from './tables';

export async function chatHistory(tableId: string, before?: number): Promise<ChatMessage[]> {
  return (await api.get<ChatMessage[]>(`/tables/${tableId}/chat`, { params: before ? { before } : undefined })).data;
}

/** Hides the message for you at once; for everyone after two reports. Reviewed by the developer. */
export async function reportMessage(tableId: string, messageId: number, reason = ''): Promise<void> {
  await api.post(`/tables/${tableId}/chat/${messageId}/report`, { reason });
}

/** Account-wide: you stop seeing this player's messages at every table. */
export async function blockPlayer(userId: string): Promise<void> {
  await api.post(`/users/${userId}/block`);
}

/** Host only. */
export async function setChatEnabled(tableId: string, enabled: boolean): Promise<TableView> {
  return (await api.patch<TableView>(`/tables/${tableId}`, { chat_enabled: enabled })).data;
}

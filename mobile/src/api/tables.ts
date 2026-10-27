import { api } from './client';

/** One row of GET /tables: the home screen's list. */
export interface TableSummary {
  id: string;
  code: string;
  status: 'lobby' | 'playing' | 'round_over' | 'finished';
  mode: 'live' | 'async';
  num_players: 2 | 4;
  your_turn: boolean;
  players: (string | null)[];
}

export async function myTables(): Promise<TableSummary[]> {
  const { data } = await api.get<TableSummary[]>('/tables');
  return data;
}

import { api } from './client';

export type TableStatus = 'lobby' | 'playing' | 'round_over' | 'finished';
export type PlayMode = 'live' | 'async';
export type SeatKind = 'friend' | 'bot';
export type BotLevel = 'relaxed' | 'standard' | 'sharp';

/** One row of GET /tables: the home screen's list. */
export interface TableSummary {
  id: string;
  code: string;
  status: TableStatus;
  mode: PlayMode;
  num_players: 2 | 4;
  preset: string;
  target_score: number;
  my_seat: number;
  your_turn: boolean;
  /** Whose turn it is when it isn't yours (null in the lobby or on your turn). */
  turn_of: { name: string | null; bot: boolean } | null;
  /** [your team, the other team]; null in the lobby. */
  scores: [number, number] | null;
  players: (string | null)[];
}

export interface CardView {
  id: number;
  label: string; // "10H", "QS", "2C", "JK"
}

export interface MeldView {
  id: number;
  cards: CardView[];
  kind: 'sequence' | 'trinca';
  wilds: number;
  canastra: 'suja' | 'limpa' | 'real' | null;
}

/** The engine's per-player view (backend Round.view_for). */
export interface GameView {
  seat: number;
  current: number;
  phase: 'draw' | 'play' | 'over';
  hand: CardView[];
  hand_sizes: number[];
  stock_size: number;
  discard: CardView[];
  teams: { morto_waiting: boolean; took_morto: boolean; melds: MeldView[] }[];
  went_out: number | null;
}

export interface SeatView {
  seat: number;
  team: 0 | 1;
  name: string | null;
  is_you: boolean;
  bot: boolean;
  open: boolean;
  connected: boolean | null;
  covered_by_bot: boolean;
}

export interface TeamScore {
  melded: number;
  canastras: { suja: number; limpa: number; real: number };
  canastra_bonus: number;
  bater: number;
  hand_penalty: number;
  morto_penalty: number;
  total: number;
}

/** Everything one player may see of a table (backend services.tables.table_view). */
export interface TableView {
  id: string;
  code: string;
  preset: string;
  num_players: 2 | 4;
  mode: PlayMode;
  chat_enabled: boolean;
  bot_level: BotLevel;
  target_score: number;
  status: TableStatus;
  is_host: boolean;
  my_seat: number | null;
  current_seat: number | null;
  seats: SeatView[];
  scores: [number, number];
  rounds: [TeamScore, TeamScore][];
  winner: 0 | 1 | null;
  /** Set once someone at a finished table asked to play again with the same group. */
  rematch_id: string | null;
  game: GameView | null;
  /** Bot moves made since the last change, as you saw them, ending at `game`: the app replays
   * them at a person's pace. Empty when no bot moved (and on a plain reload). */
  steps?: BotStep[];
}

export interface BotStep {
  seat: number | null; // null: the table just before the bots moved
  action: Action['type'] | null;
  game: GameView;
}

export type Preset = 'aberto' | 'fechado' | 'stbl';

export interface NewTable {
  preset?: Preset;
  num_players: 2 | 4;
  /** Seats 1..n-1; the host sits at 0. */
  seats: SeatKind[];
  mode: PlayMode;
  chat_enabled: boolean;
  bot_level?: BotLevel;
  target_score?: number;
}

export type Action =
  | { type: 'draw' }
  | { type: 'take_discard'; use_with?: number[]; meld?: number }
  | { type: 'lay_down'; cards: number[] }
  | { type: 'add_to_meld'; meld: number; cards: number[] }
  | { type: 'discard'; card: number };

export async function myTables(): Promise<TableSummary[]> {
  return (await api.get<TableSummary[]>('/tables')).data;
}

export async function createTable(body: NewTable): Promise<TableView> {
  return (await api.post<TableView>('/tables', { preset: 'aberto', ...body })).data;
}

export async function joinTable(code: string): Promise<TableView> {
  return (await api.post<TableView>('/tables/join', { code: code.trim().toUpperCase() })).data;
}

export async function getTable(id: string): Promise<TableView> {
  return (await api.get<TableView>(`/tables/${id}`)).data;
}

export async function startTable(id: string): Promise<TableView> {
  return (await api.post<TableView>(`/tables/${id}/start`)).data;
}

export async function act(id: string, action: Action): Promise<TableView> {
  return (await api.post<TableView>(`/tables/${id}/actions`, { action })).data;
}

/** Practice games only: the move the sharp bot would make in your seat. */
export async function getHint(id: string): Promise<Action> {
  return (await api.get<{ action: Action }>(`/tables/${id}/hint`)).data.action;
}

export async function nextRound(id: string): Promise<TableView> {
  return (await api.post<TableView>(`/tables/${id}/next-round`)).data;
}

/** "Jogar de novo com o mesmo grupo": the new table (the same one whoever asks). */
export async function rematch(id: string): Promise<TableView> {
  return (await api.post<TableView>(`/tables/${id}/rematch`)).data;
}

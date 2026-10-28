export type RootStackParamList = {
  SignIn: undefined;
  /** A guest signing in with Apple or Google from Settings (keeps their games). */
  Account: undefined;
  Home: undefined;
  Settings: undefined;
  Support: undefined;
  NewTable: { practice?: boolean } | undefined;
  Join: undefined;
  Lobby: { tableId: string };
  Table: { tableId: string };
};

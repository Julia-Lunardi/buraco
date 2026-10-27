export type RootStackParamList = {
  SignIn: undefined;
  Home: undefined;
  Settings: undefined;
  Support: undefined;
  NewTable: { practice?: boolean } | undefined;
  Join: undefined;
  Lobby: { tableId: string };
  Table: { tableId: string };
};

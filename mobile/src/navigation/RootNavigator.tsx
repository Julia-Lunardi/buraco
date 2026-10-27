import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';

import { useAuth } from '../auth/AuthContext';
import { t } from '../i18n';
import { useNotificationTaps } from '../notifications/useNotificationTaps';
import HomeScreen from '../screens/HomeScreen';
import JoinScreen from '../screens/JoinScreen';
import LobbyScreen from '../screens/LobbyScreen';
import NewTableScreen from '../screens/NewTableScreen';
import TableScreen from '../screens/TableScreen';
import SupportScreen from '../features/support/SupportScreen';
import SettingsScreen from '../screens/SettingsScreen';
import SignInScreen from '../screens/SignInScreen';
import { useTheme } from '../theme';
import { navigationRef } from './ref';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { status } = useAuth();
  const { name, c } = useTheme();
  useNotificationTaps(status === 'signedIn');

  if (status === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface }}>
        <ActivityIndicator color={c.inkSoft} />
      </View>
    );
  }

  const base = name === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: { ...base.colors, background: c.surface, card: c.surface, text: c.ink, primary: c.accentInk, border: c.line },
  };

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerShadowVisible: false }}>
        {status === 'signedOut' ? (
          <Stack.Screen name="SignIn" component={SignInScreen} options={{ headerShown: false }} />
        ) : (
          <>
            <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Settings" component={SettingsScreen}
                          options={{ title: t('settings.title'), headerBackTitle: t('common.back') }} />
            <Stack.Screen name="NewTable" component={NewTableScreen}
                          options={{ title: t('newTable.title'), headerBackTitle: t('common.back') }} />
            <Stack.Screen name="Join" component={JoinScreen}
                          options={{ title: t('join.title'), headerBackTitle: t('common.back') }} />
            <Stack.Screen name="Lobby" component={LobbyScreen}
                          options={{ title: t('lobby.title'), headerBackTitle: t('common.back') }} />
            <Stack.Screen name="Table" component={TableScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Support" component={SupportScreen}
                          options={{ title: t('support.title'), headerBackTitle: t('common.back') }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';

import { useAuth } from '../auth/AuthContext';
import { t } from '../i18n';
import HomeScreen from '../screens/HomeScreen';
import SupportScreen from '../features/support/SupportScreen';
import SettingsScreen from '../screens/SettingsScreen';
import SignInScreen from '../screens/SignInScreen';
import { useTheme } from '../theme';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { status } = useAuth();
  const { name, c } = useTheme();

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
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerShadowVisible: false }}>
        {status === 'signedOut' ? (
          <Stack.Screen name="SignIn" component={SignInScreen} options={{ headerShown: false }} />
        ) : (
          <>
            <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Settings" component={SettingsScreen}
                          options={{ title: t('settings.title'), headerBackTitle: t('common.back') }} />
            <Stack.Screen name="Support" component={SupportScreen}
                          options={{ title: t('support.title'), headerBackTitle: t('common.back') }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

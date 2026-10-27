import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from './src/auth/AuthContext';
import { TipJarProvider } from './src/features/support/useTipJar';
import RootNavigator from './src/navigation/RootNavigator';
import { PreferencesProvider } from './src/settings/PreferencesContext';
import { fonts } from './src/theme/fonts';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  // Fonts are also embedded at build time (expo-font plugin); loading here covers Expo Go.
  const [fontsLoaded, fontError] = useFonts(fonts);

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PreferencesProvider>
          <AuthProvider>
            <TipJarProvider>
              <StatusBar style="auto" />
              <RootNavigator />
            </TipJarProvider>
          </AuthProvider>
        </PreferencesProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

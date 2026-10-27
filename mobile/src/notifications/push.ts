import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import { api } from '../api/client';
import { i18n } from '../i18n';

type Notifications = typeof import('expo-notifications');

/** expo-notifications, loaded lazily: its import registers a push-token listener that
 * throws on Android in Expo Go, killing the app before React mounts (Salvie 19.09.2026).
 * Null where push isn't available (Expo Go, simulators). */
export const notifications: Notifications | null = (() => {
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy on purpose (see above)
    const mod = require('expo-notifications') as Notifications;
    // The table is already on screen when a turn changes; banners in the app would be noise.
    mod.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: false, shouldShowList: true, shouldPlaySound: false,
                                         shouldSetBadge: false }),
    });
    return mod;
  } catch {
    return null;
  }
})();

const ASKED_KEY = 'pushPrimerShown';
let currentToken: string | null = null;

/** Show the priming sheet only once, and only after the player's first table. */
export async function shouldOfferPush(): Promise<boolean> {
  if (!notifications || !Device.isDevice) return false;
  const asked = await AsyncStorage.getItem(ASKED_KEY).catch(() => 'yes');
  if (asked) return false;
  const { status } = await notifications.getPermissionsAsync();
  return status === 'undetermined';
}

export async function markPushOffered(): Promise<void> {
  await AsyncStorage.setItem(ASKED_KEY, 'yes').catch(() => {});
}

/** Ask the OS (only after the player tapped "Ativar avisos") and register the token. */
export async function enablePush(): Promise<boolean> {
  if (!notifications || !Device.isDevice) return false;
  const { status } = await notifications.requestPermissionsAsync();
  if (status !== 'granted') return false;
  await registerToken();
  return true;
}

/** Register (or re-register, e.g. after sign-in) this device's token in the device language. */
export async function registerToken(): Promise<void> {
  if (!notifications || !Device.isDevice) return;
  const { status } = await notifications.getPermissionsAsync();
  if (status !== 'granted') return;
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    const { data } = await notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    currentToken = data;
    await api.post('/users/me/push-token', { token: data, platform: Platform.OS, locale: i18n.locale });
  } catch {
    // Best effort: a failed registration retries at the next launch.
  }
}

/** On sign-out: the next person on this phone must not get this player's notices. */
export async function unregisterToken(): Promise<void> {
  if (!currentToken) return;
  await api.post('/users/me/push-token/remove', { token: currentToken }).catch(() => {});
  currentToken = null;
}

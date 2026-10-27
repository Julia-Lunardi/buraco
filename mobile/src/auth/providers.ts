import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

import { GOOGLE_CLIENT_IDS } from '../config';

// ---------------------------------------------------------------------------------------
// Google
// ---------------------------------------------------------------------------------------

type NativeGoogle = typeof import('@react-native-google-signin/google-signin');

/** Native Google Sign-In, Android only. Loaded lazily: a static import resolves the
 * RNGoogleSignin native module at bundle load and crashes any binary without it (Expo Go,
 * every iOS build). Null means "use the expo-auth-session browser flow". */
export const nativeGoogle: NativeGoogle | null = (() => {
  if (Platform.OS !== 'android') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- must stay lazy (see above)
    return require('@react-native-google-signin/google-signin') as NativeGoogle;
  } catch {
    return null; // Expo Go
  }
})();

/** Android asks Google for a token addressed to the WEB client, so the web id is what
 * matters there; iOS uses the iOS client. Gating on the wrong one showed Salvie a button
 * that could never succeed. */
export const googleReady = Platform.OS === 'android'
  ? !!GOOGLE_CLIENT_IDS.web
  : !!(GOOGLE_CLIENT_IDS.ios || GOOGLE_CLIENT_IDS.web);

let configured = false;

/** Android native flow. Resolves to an idToken, or null when the player cancelled. */
export async function googleSignInAndroid(): Promise<string | null> {
  if (!nativeGoogle) throw new Error('Native Google Sign-In unavailable');
  const { GoogleSignin, statusCodes } = nativeGoogle;
  if (!configured) {
    GoogleSignin.configure({ webClientId: GOOGLE_CLIENT_IDS.web });
    configured = true;
  }
  try {
    await GoogleSignin.hasPlayServices();
    const response = await GoogleSignin.signIn();
    // A cancel resolves as a non-success type rather than throwing.
    if (response.type !== 'success' || !response.data?.idToken) return null;
    return response.data.idToken;
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === statusCodes.SIGN_IN_CANCELLED || code === statusCodes.IN_PROGRESS) return null;
    throw error;
  }
}

// ---------------------------------------------------------------------------------------
// Apple
// ---------------------------------------------------------------------------------------

export interface AppleCredential {
  identityToken: string;
  rawNonce: string;
  fullName?: string;
  appleUserId: string;
}

/** 32 random bytes as hex: the RAW nonce, which stays in the app and goes to our backend. */
export function generateNonce(): string {
  return Array.from(Crypto.getRandomBytes(32), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Resolves to a credential, or null when the player cancelled. Apple receives the HASHED
 * nonce and stores exactly that; the backend checks SHA256(raw) against it. Sending the raw
 * nonce to Apple makes every sign-in fail (Woddie). */
export async function appleSignIn(): Promise<AppleCredential | null> {
  const rawNonce = generateNonce();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
                        AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: hashedNonce,
    });
    if (!credential.identityToken) throw new Error('Apple returned no identity token');
    // Only on the very first sign-in; joined, empty parts dropped.
    const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
      .filter(Boolean).join(' ') || undefined;
    return { identityToken: credential.identityToken, rawNonce, fullName, appleUserId: credential.user };
  } catch (error) {
    if ((error as { code?: string })?.code === 'ERR_REQUEST_CANCELED') return null;
    throw error;
  }
}

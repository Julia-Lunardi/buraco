import * as AppleAuthentication from 'expo-apple-authentication';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { errorDetail } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { appleSignIn, googleReady, googleSignInAndroid, nativeGoogle } from '../auth/providers';
import GoogleLogo from '../components/GoogleLogo';
import { GOOGLE_CLIENT_IDS, LEGAL_URLS } from '../config';
import { t } from '../i18n';
import { useTheme } from '../theme';

WebBrowser.maybeCompleteAuthSession(); // must run at module level for the redirect

// useAuthRequest throws on an undefined client id at first render, and hooks can't be
// conditional: a placeholder keeps it quiet while `googleReady` hides the button.
const PLACEHOLDER_CLIENT_ID = 'missing-client-id';
const BUTTON_HEIGHT = 52;
const LOGO = require('../../assets/icon.png');

export default function SignInScreen() {
  const { c, space, radius, type } = useTheme();
  const insets = useSafeAreaInsets();
  const { playAsGuest, signInWithGoogle, signInWithApple } = useAuth();

  const [busy, setBusy] = useState<'google' | 'apple' | 'guest' | null>(null);
  const [error, setError] = useState('');
  // Optimistic on iOS: a slow or failed availability check must not silently remove a
  // sign-in method Apple requires. Only an explicit `false` (Expo Go) hides it.
  const [appleAvailable, setAppleAvailable] = useState(Platform.OS === 'ios');
  // The native Apple button draws nothing without a numeric width (a % width measures 0
  // under Fabric: Salvie's button was invisible on device builds).
  const [appleWidth, setAppleWidth] = useState(0);

  // Default authorization-code flow. Never responseType 'id_token': native OAuth clients
  // reject the implicit flow with `unsupported_response_type` (Salvie).
  const [request, response, promptGoogle] = Google.useAuthRequest({
    clientId: GOOGLE_CLIENT_IDS.web || PLACEHOLDER_CLIENT_ID,
    iosClientId: GOOGLE_CLIENT_IDS.ios || undefined,
    androidClientId: GOOGLE_CLIENT_IDS.android || undefined,
    scopes: ['openid', 'profile', 'email'],
  });

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AppleAuthentication.isAvailableAsync()
      .then((available) => {
        setAppleAvailable(available);
        if (__DEV__ && !available) {
          console.warn('[auth] Sign in with Apple hidden: not in this binary. Use a dev build, not Expo Go.');
        }
      })
      .catch(() => {});
  }, []);

  // Browser flow result (iOS, and Android in Expo Go). expo-auth-session exchanges the code
  // itself and only then exposes `response` as state, so reacting in an effect is the
  // documented pattern (the result of promptAsync() has no tokens yet).
  useEffect(() => {
    if (!response) return;
    if (response.type !== 'success') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- see comment above
      setBusy(null);
      if (response.type === 'error') setError(t('signIn.googleFailed'));
      return;
    }
    const idToken = response.authentication?.idToken; // not response.params.id_token
    if (!idToken) {
      setBusy(null);
      setError(t('signIn.googleFailed'));
      return;
    }
    signInWithGoogle(idToken)
      .catch((e) => setError(errorDetail(e, t('signIn.googleFailed'))))
      .finally(() => setBusy(null));
  }, [response, signInWithGoogle]);

  async function onGoogle() {
    setError('');
    setBusy('google');
    if (Platform.OS === 'android' && nativeGoogle) {
      try {
        const idToken = await googleSignInAndroid();
        if (idToken) await signInWithGoogle(idToken);
      } catch (e) {
        setError(errorDetail(e, t('signIn.googleFailed')));
      } finally {
        setBusy(null); // also after a cancel: Salvie's spinner once spun forever
      }
      return;
    }
    promptGoogle(); // the effect above finishes the job
  }

  async function onApple() {
    if (busy) return;
    setError('');
    setBusy('apple');
    try {
      const credential = await appleSignIn();
      if (credential) {
        await signInWithApple(credential.identityToken, credential.rawNonce, credential.fullName,
                              credential.appleUserId);
      }
    } catch (e) {
      setError(errorDetail(e, t('signIn.appleFailed')));
    } finally {
      setBusy(null);
    }
  }

  async function onGuest() {
    setError('');
    setBusy('guest');
    try {
      await playAsGuest();
    } catch (e) {
      setError(errorDetail(e, t('common.somethingWrong')));
    } finally {
      setBusy(null);
    }
  }

  const buttonBase = {
    height: BUTTON_HEIGHT, borderRadius: radius.radiusMd, alignItems: 'center' as const,
    justifyContent: 'center' as const, flexDirection: 'row' as const, gap: space.space2,
  };

  const legal = (label: string, url: string) => url
    ? <Text style={{ color: c.accent }} accessibilityRole="link" onPress={() => Linking.openURL(url)}>{label}</Text>
    : <Text>{label}</Text>;

  // On the felt (Claude Design "Entrar"): the Buraco Lounge logo, the wordmark, then the
  // sign-in buttons in each brand's own colours and the guest option as a plain link.
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.table }}
      contentContainerStyle={{
        flexGrow: 1, alignItems: 'center', paddingHorizontal: space.space5,
        paddingTop: insets.top + space.space5, paddingBottom: insets.bottom + space.space5,
      }}
    >
      <View style={{ flex: 1, width: '100%', maxWidth: 420, gap: space.space3 }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.space6, minHeight: 320 }}>
          <View importantForAccessibility="no-hide-descendants"
                style={{ borderRadius: 30, boxShadow: '0 6px 18px rgba(0, 0, 0, 0.35)' }}>
            <Image source={LOGO} accessibilityIgnoresInvertColors style={{ width: 128, height: 128, borderRadius: 30 }} />
          </View>
          <View style={{ alignItems: 'center', gap: 10 }}>
            <Text style={[type.wordmark, { color: c.tableInk, textAlign: 'center' }]} accessibilityRole="header">
              {t('appName').replace(' ', '\n') /* two lines, as the design's wordmark */}
            </Text>
            <Text style={[type.body, { color: c.tableInkSoft, textAlign: 'center', maxWidth: 260 }]}>{t('signIn.tagline')}</Text>
          </View>
        </View>

        {error ? (
          <Text accessibilityLiveRegion="polite" style={[type.body, { color: c.tableInk, textAlign: 'center' }]}>
            {error}
          </Text>
        ) : null}

        {Platform.OS === 'ios' && appleAvailable && (
          <View onLayout={(e) => setAppleWidth(e.nativeEvent.layout.width)}
                style={{ height: BUTTON_HEIGHT, opacity: busy === 'apple' ? 0.6 : 1 }}>
            {appleWidth > 0 && (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                cornerRadius={radius.radiusMd}
                style={{ width: appleWidth, height: BUTTON_HEIGHT }}
                onPress={onApple}
              />
            )}
          </View>
        )}

        {googleReady && (
          <Pressable
            onPress={onGoogle}
            disabled={!!busy || (!nativeGoogle && !request)}
            accessibilityRole="button"
            style={({ pressed }) => [buttonBase, {
              // Google's light button: white, #747775 outline, #1F1F1F text.
              backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#747775',
              opacity: pressed || busy === 'google' ? 0.7 : 1,
            }]}
          >
            {busy === 'google' ? <ActivityIndicator color="#1F1F1F" /> : (
              <>
                <GoogleLogo size={20} />
                <Text style={[type.label, { color: '#1F1F1F' }]}>{t('signIn.continueGoogle')}</Text>
              </>
            )}
          </Pressable>
        )}

        <Pressable
          onPress={onGuest}
          disabled={!!busy}
          accessibilityRole="button"
          accessibilityHint={t('signIn.guestHint')}
          style={({ pressed }) => [buttonBase, { height: 44, opacity: pressed ? 0.6 : 1 }]}
        >
          {busy === 'guest' ? <ActivityIndicator color={c.tableInkSoft} />
            : <Text style={[type.label, { color: c.tableInk }]}>{t('signIn.guest')}</Text>}
        </Pressable>

        <Text style={[type.caption, { color: c.tableInkSoft, textAlign: 'center' }]}>
          {t('signIn.legalBefore')}{legal(t('signIn.termsLong'), LEGAL_URLS.terms)}{t('signIn.legalMiddle')}
          {legal(t('signIn.privacyLong'), LEGAL_URLS.privacy)}{t('signIn.legalAfter')}
        </Text>
      </View>
    </ScrollView>
  );
}

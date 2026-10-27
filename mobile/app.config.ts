import type { ConfigContext, ExpoConfig } from 'expo/config';

// Native projects (ios/, android/) are never committed: EAS runs `expo prebuild` from this
// file on every build. A committed ios/ went stale in Salvie and silently dropped the Sign in
// with Apple entitlement and the Google redirect scheme.

const BUNDLE_ID = 'com.buraco.app';
const platform = process.env.EAS_BUILD_PLATFORM; // set by EAS; undefined locally

// Google's iOS OAuth client redirects back through its *reversed* client id. Without that
// URL scheme, expo-auth-session never gets an idToken and /auth/google is never called.
const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';
const reversedIosClientId = iosClientId ? iosClientId.split('.').reverse().join('.') : null;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Buraco',
  slug: 'buraco',
  scheme: 'buraco',
  version: '1.0.0',
  // Both orientations; the player picks automatic, portrait or landscape in Settings
  // (expo-screen-orientation locks at runtime).
  orientation: 'default',
  userInterfaceStyle: 'automatic',
  icon: './assets/icon.png',
  ios: {
    supportsTablet: true,
    bundleIdentifier: BUNDLE_ID,
    usesAppleSignIn: true,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      // Opts out of iPad Split View / Slide Over, which runtime orientation locks need.
      UIRequiresFullScreen: true,
      // Setting CFBundleURLTypes makes prebuild ignore `scheme`, so every scheme is listed.
      CFBundleURLTypes: [
        { CFBundleURLSchemes: ['buraco', BUNDLE_ID] },
        ...(reversedIosClientId ? [{ CFBundleURLSchemes: [reversedIosClientId] }] : []),
      ],
    },
  },
  android: {
    package: BUNDLE_ID,
    adaptiveIcon: {
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
      backgroundColor: '#1f3d32',
    },
    predictiveBackGestureEnabled: false,
    // Request only what is used: extra permissions trigger Play declarations (Salvie).
    permissions: [],
    blockedPermissions: ['android.permission.RECORD_AUDIO', 'android.permission.READ_MEDIA_IMAGES'],
  },
  plugins: [
    'expo-secure-store',
    'expo-web-browser',
    'expo-localization',
    [
      'expo-font',
      {
        fonts: [
          './node_modules/@expo-google-fonts/atkinson-hyperlegible-next/400Regular/AtkinsonHyperlegibleNext_400Regular.ttf',
          './node_modules/@expo-google-fonts/atkinson-hyperlegible-next/600SemiBold/AtkinsonHyperlegibleNext_600SemiBold.ttf',
          './node_modules/@expo-google-fonts/atkinson-hyperlegible-next/700Bold/AtkinsonHyperlegibleNext_700Bold.ttf',
          './node_modules/@expo-google-fonts/fraunces/600SemiBold/Fraunces_600SemiBold.ttf',
        ],
      },
    ],
    ['expo-splash-screen', { backgroundColor: '#1f3d32', image: './assets/splash-icon.png', imageWidth: 120 }],
    ['expo-screen-orientation', { initialOrientation: 'DEFAULT' }],
    // Permission is asked only after the player's first table, never at launch.
    'expo-notifications',
    // Store billing for the optional contributions (adds Android's BILLING permission).
    'expo-iap',
    // Sign in with Apple: iOS only. Native Google Sign-In: Android only (iOS uses
    // expo-auth-session; see also package.json expo.autolinking.ios.exclude).
    ...(platform !== 'android' ? ['expo-apple-authentication'] : []),
    ...(platform !== 'ios' ? ['@react-native-google-signin/google-signin'] : []),
  ],
  extra: {
    // Written by `eas init` (runbook): extra.eas.projectId.
    ...config.extra,
  },
});

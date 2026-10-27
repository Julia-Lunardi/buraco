# Mobile Changelog

## 27.10.2026 (2)

- The "Apoie o app" (Support the app) screen, reached only from Settings: contributions toward the server costs (`docs/plans/tip-jar.md`).
  - Three equally weighted buttons showing the store's own localised prices.
  - A cancel shows nothing; a thank-you is one quiet line.
  - The payment line is keyed by platform, so iOS never shows the words "Google Play".
- `src/features/support/`:
  - `tipJar.ts` is the **only** file that imports the billing library, `expo-iap` pinned to exactly 6.3.0, which includes the OpenIAP #528 fix: a refused Android consume now throws instead of reporting success.
  - `controller.ts` holds the behaviour without React or a store.
  - `useTipJar` is the thin hook the screen uses.
  - `tipJar.mock.ts` is a pretend store, used in Expo Go, with `EXPO_PUBLIC_TIP_JAR_MOCK=1`, and in tests.
- Robust consumables:
  - The provider starts **at app launch**, so purchases completed while the screen was closed, or after a restart, are recovered and finished.
  - Every tip is finished with `isConsumable: true`: consumed on Android, transaction finished on iOS.
  - A refused consume is shown as a failure and retried at the next launch, never as a thank-you.
  - Pending purchases are left alone until they complete.
- No analytics, no logging of payment details, no backend.
- 12 tests covering products load, success, cancel, failure, pending, unavailable (both kinds), refused consume, recovery at launch, background completion, double tap and mock-mode selection. 29 in total.

## 27.10.2026

- New Expo SDK 57 app (TypeScript), set up from the start with every native-config lesson from Woddie and Salvie:
  - `app.config.ts` only, with `ios/` and `android/` never committed;
  - every URL scheme listed explicitly, including the reversed iOS Google client id, because setting `CFBundleURLTypes` makes prebuild ignore `scheme`;
  - Sign in with Apple via `usesAppleSignIn`;
  - `expo-apple-authentication` on iOS only and `@react-native-google-signin` on Android only, the latter excluded from iOS autolinking (the AppCheckCore pod failure);
  - no `edgeToEdgeEnabled` or `newArchEnabled`, which SDK 57 rejects;
  - an empty Android permission list, with `RECORD_AUDIO` and `READ_MEDIA_IMAGES` blocked.
- Sign-in ported from Salvie's working version:
  - Google on iOS uses the default code flow and reads `response.authentication.idToken`.
  - Google on Android uses the native module, loaded lazily so Expo Go still boots, and is gated on the **web** client id.
  - Cancelling a Google sign-in clears the spinner in `finally`.
  - Apple: the hashed nonce goes to Apple and the raw nonce to the backend; the button gets a measured numeric width; the Apple user id is stored only after the session; credentials are re-checked when the app returns to the foreground.
  - Errors show the backend's `detail`.
- "Play against bots without an account" (guest). When a guest signs in later, their token goes along and the backend turns the guest into the real account.
- `session.ts` contains the refresh logic as pure functions, unit-tested: 5 concurrent 401s cause 1 refresh, and only a 401 from `/auth/refresh` signs out.
- Theme generated from the design system snapshot (`npm run theme`), with a test that fails on drift. The blue-grey felt swaps exactly two tokens. Atkinson Hyperlegible Next and Fraunces are bundled (`@expo-google-fonts`, plus the `expo-font` plugin).
- i18n in pt-BR, en and da, typed against pt-BR. Any Portuguese locale gets pt-BR, anything else English. A test bans the word "doação" (donation) in UI copy.
- Screens:
  - **Sign in.**
  - **Home**: your tables, yours-to-play first; only working actions are shown.
  - **Settings**: theme, felt and orientation (an `expo-screen-orientation` lock), sign out, delete account with confirmation.
- Checks: `expo-doctor` 21/21, the bundle builds for iOS and Android, lint and typecheck are clean, and 17 tests pass. CI runs lint, typecheck and tests.

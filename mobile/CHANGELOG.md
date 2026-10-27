# Mobile Changelog

## 27.10.2026 (5)

- Server errors are explained in the app's language instead of the server's English (`api/errors.ts`). This is the "why was that illegal?" text: rules explained, never blame. Example: "Um jogo precisa de 3 cartas seguidas do mesmo naipe, ou de 3 cartas iguais (trinca), com no máximo 1 curinga."
  - `wrong_phase` reads "draw first" or "you already drew" depending on the phase.
  - An unknown code still shows the server's own reason, so nothing fails silently.
  - A test scans `backend/app` for every error code and fails if the app can't explain one, except a short explicit list of codes players can't trigger.
- Tapping a notification opens its table, both while the app is running and when the tap launches it.

## 27.10.2026 (4)

- Chat panel on the table (`features/chat/`):
  - It slides up over the table in table colours, with an unread dot on the "Chat" button.
  - Six quick phrases per language ("Boa!", "Bem jogado", "Vai logo 😅"…), a 300-character limit, and team marks (● / ◆) on names.
- Long-press a message for its actions, shown as an inline row (Android alerts can't show four buttons):
  - **mute**: per player and per table, kept on this phone;
  - **report**: hidden for you at once, and for everyone after two reports;
  - **block**: account-wide, so their messages vanish at every table.
- The host can turn chat off from the panel; everyone sees "O chat está desligado nesta mesa".
- Chat shows only at tables with at least two people: bot tables have nobody to talk to, and guests can't chat.
- History (REST) and live (socket) messages merge without duplicates. A muted player never lights the unread dot. 5 tests; 46 in total.

## 27.10.2026 (3)

- The full flow works end to end:
  - **Home** has three actions: new table, join with a code, and practice against bots (guests get practice only). Tapping a table opens it.
  - **New table**: rules (Aberto; Fechado and STBL "em breve"), 2 or 4 players, friend or bot per seat (partner opposite in 4-player games), live or async with a one-line explanation, 1.500 or 3.000 points, chat on or off.
  - **Join** uses a 6-character code.
  - **Lobby**: the code to share, seats filling live, who's connected, and the host's start button. Everyone moves to the table when the game starts.
- **Table: a working prototype**, so games can be played on a device now:
  - the hand with tap-to-select, the melds per team with limpa, suja and real frames, the stock, the top of the pile, and each team's morto;
  - draw, take the pile, lay down, add to a meld, and discard;
  - the illegal-move reason from the server, the round summary, the next round and game over.
  - The designed table from Claude Design replaces only its layout; the data flow stays.
- `realtime/tableSocket.ts` implements the live protocol without React, unit-tested (12 tests):
  - it authenticates in the first message, so tokens never go in URLs;
  - it reconnects with 1/2/5/10 s backoff, reset after a good reconnection;
  - an expired token (4401) gets one refresh and an immediate retry; "not seated" (4404) stops;
  - it pings every 25 s.
  - `useTableSocket` wraps it.
- Notifications:
  - `expo-notifications` loads lazily; a static import crashed Android Expo Go in Salvie.
  - A priming sheet ("Quer saber quando for sua vez?") appears **once**, on the first lobby or table, and the system prompt only follows a tap on "Ativar avisos".
  - The token is registered in the device's language and re-registered after sign-in (without a prompt). It is removed on sign-out, so the next person on the phone gets nothing.
  - No banners inside the app, because the table is already on screen.
- `PlayingCard` follows the design system: off-white face, a `wild` corner notch on 2s and jokers, a gold outline that lifts when selected, and spoken names in all three languages ("10 de copas", "hjerter 10").
- `Button` (primary, secondary, quiet). `SegmentedControl` infers its type from `value` (`NoInfer`).
- The Android `google-services.json` comes from the EAS file variable `GOOGLE_SERVICES_JSON`; the file is gitignored and would never reach EAS.
- 41 tests. Lint and typecheck clean, `expo-doctor` 21/21, and both platforms bundle.

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

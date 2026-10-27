# Buraco mobile

Expo SDK 57, React Native 0.86, TypeScript, React Navigation. One codebase for iPhone, iPad and
Android, in both orientations (the player picks in Settings).

```bash
npm install
cp .env.example .env      # EXPO_PUBLIC_API_URL = your Mac's LAN IP, port 8001
npx expo start            # Expo Go for UI work
npm test && npm run typecheck && npm run lint
```

**Sign-in only works in a development build, never in Expo Go.** Google rejects Expo Go's
`exp://` redirect with a 400, and the Apple module isn't in the Expo Go binary (the button is
hidden, with a `[auth]` warning). Build a dev client:

```bash
eas build --profile development-device --platform ios
eas build --profile development --platform android
npx expo start --dev-client
```

## Where things are

| Path | What |
|---|---|
| `app.config.ts` | Bundle id, URL schemes (with the reversed iOS Google client id), Apple entitlement, platform-only plugins |
| `eas.json` | Build profiles. `env` holds the API URL and Google client ids, because `.env` never reaches EAS |
| `src/auth/` | `session.ts` (pure token storage and de-duplicated refresh, unit-tested), `providers.ts` (Google and Apple), `AuthContext.tsx` |
| `src/api/` | The axios client: Bearer header, silent refresh on 401, `errorDetail()` that shows the backend's reason |
| `src/theme/` | `tokens.ts` is **generated** from `docs/design/tokens.json` (`npm run theme`); a test fails if it drifts |
| `src/i18n/` | pt-BR is the source. en and da are typed against it, so a missing key is a type error |
| `src/settings/` | Theme, felt colour and orientation, saved on the device |

Never commit `ios/` or `android/`: EAS runs `expo prebuild` from `app.config.ts` on every build.

# Plan: tip jar ("Apoie o app")

Status: **planned and approved (26.10.2026): expo-iap.** Price tiers default to USD 0.99 / 2.99 / 4.99 (Apple and Google set the local prices; in Brazil roughly R$ 5 / 15 / 25). Julia sets the actual tiers when she creates the products. No code yet: it is built during the mobile phase, after the app foundation (Expo app, theme, i18n, Settings) exists. Julia's original brief is kept verbatim at the end of this file and is the source of truth.

## What it is

An optional "Support the app" screen, reachable **only** from Settings, with three equally weighted contribution buttons. Contributions are consumable store purchases (Apple In-App Purchase, Google Play Billing) that unlock nothing. No popups, banners, badges or prompts anywhere else, and never after a game.

## Purpose: server costs, not a personal tip (Julia, 26.10.2026)

The money pays for **the app's servers** (the backend that runs the tables), not for the developer personally. This decision overrides the brief's "made by one person" framing below:

- **Copy talks about keeping the tables running.** No "buy me a coffee", no personal treats, and no "made by one person".
  - pt-BR: "O Buraco é gratuito e sem anúncios. As contribuições ajudam a pagar os servidores que mantêm as mesas funcionando. São opcionais e não desbloqueiam nada."
  - en: "Buraco is free and has no ads. Contributions help pay for the servers that keep the tables running. They're optional and unlock nothing."
  - da: "Buraco er gratis og uden reklamer. Bidrag hjælper med at betale for de servere, der holder bordene kørende. De er frivillige og låser ikke op for noget."
- **The wording is "contribuição" / "apoio" ("contribution" / "support"), never "doação" ("donation").** Apple allows in-app *donations* only for registered nonprofits (Guideline 3.2.1), and the stores pay the money to the developer account either way. Calling it a donation would invite rejection and would also be inaccurate.
- **No precise claims** such as "one month of servers", unless the amounts are made to match the real Azure costs. A promise in the copy has to stay true.
- The user never sees the product IDs, so they keep the `tip_*` names from the brief. Renaming them `support_*` is possible until the products are created in the stores, but not afterwards.

## Library: recommendation (needs Julia's OK)

Checked on 26.10.2026. All three are actively maintained.

| | expo-iap | react-native-iap | RevenueCat (react-native-purchases) |
|---|---|---|---|
| Latest | 6.3.0 (25.10.2026) | 17.2.2 (25.10.2026) | 10.15.1 (22.10.2026) |
| Releases since July 2026 | 45 | 48 | 26 |
| Integration | Expo module with its own config plugin | Nitro module (needs `react-native-nitro-modules`) | SDK, plus a RevenueCat account and dashboard |
| Backend or account needed | No | No | Yes: a RevenueCat project and API keys; purchase data passes through RevenueCat |
| Cost | Free, open source | Free, open source | Free up to about $2,500/month tracked revenue, then a percentage |

**Recommendation: expo-iap.**
- It is the Expo-native wrapper of the same OpenIAP API that `react-native-iap` implements. Woddie and Salvie use `react-native-iap`, so the calls (`fetchProducts`, `requestPurchase`, `finishTransaction({ purchase, isConsumable: true })`) and the lessons carry over.
- It needs no extra native runtime and ships an Expo config plugin, so it is the simplest fit for an Expo + EAS project.
- RevenueCat is built for subscriptions and entitlements. For three consumables with no backend it adds an account, API keys and a third party that sees purchase data, which goes against "no third-party SDKs beyond the billing library" and against keeping it client-side.
- If Julia prefers one library across all her apps, `react-native-iap` is a fine second choice with the same code shape.

**Version cautions, both learned the hard way:**
- **Pin an exact version.** Woddie had to pin `react-native-iap` 15.2.4 because 15.6.x pulled an OpenIAP pod that needed the iOS 27 SDK (Xcode 27). expo-iap uses the same OpenIAP pods, so prove a release builds on our Xcode with an EAS iOS build before pinning it.
- **Use a release that includes OpenIAP PR #528** (merged 13.10.2026). Before it, a *refused* Android acknowledge or consume was reported as a finished purchase. For consumables that means a tip Google silently refunds after 3 days.

## Product IDs and names

- IDs (consumable, the same on both stores): `tip_small`, `tip_medium`, `tip_large`, as in the brief.
  - Woddie and Salvie use reverse-DNS IDs on iOS (`com.salvie.app.pro.monthly`) and short ones on Play. Using one plain ID set on both stores is simpler (one constant, no `Platform.select`), and Apple accepts it.
  - **Proposal: keep `tip_*` everywhere.**
- Proposed names: neutral sizes, nothing personal. The three buttons look identical, and only the name and the store price differ.

| ID | pt-BR | en | da |
|---|---|---|---|
| `tip_small` | Apoio pequeno | Small contribution | Lille bidrag |
| `tip_medium` | Apoio médio | Medium contribution | Mellem bidrag |
| `tip_large` | Apoio grande | Large contribution | Stort bidrag |

- Store product descriptions, for example: "Ajuda a pagar os servidores do Buraco. Não desbloqueia nada." / "Helps pay for Buraco's servers. Unlocks nothing."

- **Prices: Julia chooses the price tiers.** Nothing is invented here. The app shows the store's localised price string only.

## Design (mobile)

```
mobile/src/features/support/
  tipJar.ts          the only file that imports the billing library
  tipJar.mock.ts     simulated products and outcomes (success, cancel, fail, pending, unavailable)
  useTipJar.ts       hook: { status, products, buy(id), message }, UI-agnostic
  SupportScreen.tsx  Settings → "Apoie o app"
  __tests__/useTipJar.test.ts
```

- **Mock mode** applies in Expo Go automatically, or when `EXPO_PUBLIC_TIP_JAR_MOCK=1`. Expo Go can't run native purchase code, so the screen is buildable and testable there.
- **States:**
  - loading;
  - unavailable: a calm sentence, no dialog;
  - purchasing: buttons disabled, a quiet spinner;
  - thank-you: one line, no confetti;
  - cancelled: silent;
  - failed: a kind sentence plus "try again";
  - pending (for example "Ask to Buy", or a cash payment on Play): "Your tip is waiting for approval. Thank you!"
- **Finishing purchases robustly:**
  - A purchase-updated listener is mounted at **app start**, not on the screen, so purchases that complete while the screen is closed, or after a restart, still get finished.
  - On start, unfinished purchases are fetched (`getAvailablePurchases`), and each one is finished with `isConsumable: true` (consume on Android, `finishTransaction` on iOS).
  - A refused consume is surfaced, never treated as done.
- **Store wording is keyed by platform** (Playbook Phase F): "Pagamento pela App Store" or "Pagamento pelo Google Play", so the iOS build can never show the words "Google Play".
- Theme tokens come from the design system; the reduce-motion setting is respected; every string goes through i18n (pt-BR, en, da).
- No analytics, no logging of payment details, no backend, no receipt validation.

## Not needed from Buraco's backend

Nothing. The privacy policy and terms still need one paragraph each:
- Contributions are processed by Apple or Google, and the developer never sees payment details.
- They go toward the app's running costs, mainly the servers.
- They are voluntary, are not donations to a charity, unlock nothing, and refunds follow the store's policy.

## Manual steps for Julia

These are also in the launch runbook.

**App Store Connect**
- Paid Apps agreement, banking and tax information. Start early: it can take days to activate, and IAP testing doesn't work without it.
- Enrol in the App Store Small Business Program, if not already enrolled.
- Create the 3 consumable in-app purchases `tip_small`, `tip_medium`, `tip_large`:
  - names and descriptions in pt-BR, en and da;
  - your chosen price tiers;
  - a review screenshot of the Support screen.
- Review note: "Optional contributions toward the app's server costs. They unlock no content or features." This replaces the brief's "tips for the developer".
- The first in-app purchases must be submitted **together with an app version**: attach them to the version before submitting.
- Create a Sandbox tester account (Users and Access → Sandbox).

**Google Play Console**
- Payments profile / merchant account.
- Accept the reduced service fee terms (15%), if not already accepted.
- Upload a build to at least the **internal testing** track. Billing products can't be created or tested before that.
- Create the 3 one-time (consumable) products with the same IDs, and activate them.
- Add license testers (Setup → License testing).

**Library**
- expo-iap: no API keys, dashboard or entitlements. iOS has no "In-App Purchase" capability to switch on; it is available to every app.
- RevenueCat, if chosen instead: a RevenueCat project, iOS and Android API keys, the App Store Connect API key, and the Play service-account credentials.

**Development builds** (the tip jar can't run in Expo Go):
```bash
cd mobile
eas build --profile development-device --platform ios
eas build --profile development --platform android
npx expo start --dev-client
```

---

## Julia's original brief (verbatim)

> Implement an optional "tip jar" ("Support the app") in this Expo / React Native app.
>
> **Context.** This is a free, ad-free card game app (Brazilian buraco) built by a solo developer (Julia, Salvia Code Labs). Design principles: minimalistic, calm, focus on the game. The tip jar is a way for people who enjoy the app to say thanks. It must never feel like monetisation pressure.
>
> **Store rules.** Apple and Google both require their own billing for in-app tips to the developer. Do NOT link out to Ko-fi, Buy Me a Coffee, Stripe, PayPal, etc. from inside the app. Tips are consumable one-time purchases that unlock nothing.
>
> **UX.**
> - One "Support the app" screen, reachable only from Settings. No popups, banners, badges or prompts anywhere else, and never after a game or a win.
> - Short, honest copy: free, no ads, made by one person; tips are optional and unlock nothing.
> - 3 tip sizes as simple, equally weighted buttons (propose names). Prices from the store (localised); never hard-code prices.
> - States: loading, unavailable (calm message, no error dialogs), in progress, success (quiet thank-you, no confetti), cancelled (silent), failed or pending (clear, kind message).
> - Respect light/dark mode and reduce motion.
> - All strings through i18n (pt-BR first, then en and da).
>
> **Technical.**
> - Product IDs (consumable): `tip_small`, `tip_medium`, `tip_large` (same IDs on both stores; propose a naming change if the repo has conventions).
> - Check the current docs and maintenance status of RevenueCat, react-native-iap and expo-iap. Recommend one and **wait for confirmation before installing**. Preference: simplest and best maintained for consumables in Expo + EAS.
> - Config plugin and an EAS development build (Expo Go can't run native purchase code). Update `eas.json` if needed.
> - Finish consumables properly: `finishTransaction` on iOS, consume/acknowledge on Android (otherwise refunded after 3 days). Robust, including pending purchases and purchases completed while the app was closed.
> - No backend or receipt validation. Client-side only unless the library requires otherwise.
> - Don't store or log payment details. No analytics on tip behaviour.
> - Logic in a small isolated module (`features/support/`) with a thin `useTipJar` hook, mockable.
> - A mock mode (dev or env flag) simulating products and outcomes.
>
> **Tests.** Unit tests for the hook/module with the mock: products load, success, cancel, failure, pending, unavailable.
>
> **Process.** Inspect the repo and summarise; propose the library and a plan and wait for OK; implement following conventions; run lint, type checks and tests; finish with a "Manual steps for Julia" checklist (App Store Connect and Play Console items as listed above, anything the library needs, and the EAS development build commands).
>
> **Don't.** No ads, tracking or third-party SDKs beyond the billing library. Don't gate anything behind a tip. Don't invent store product details; ask.

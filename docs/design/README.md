# Design

**Source of truth:** the Buraco design system at https://claude.ai/artifact/BmhzdPTKPP13K83By3DMLy. It holds the brand book (`project/README.md`), the tokens (`project/tokens.json`) and the components with live previews.

The mobile theme (`mobile/src/theme/`) is generated from `tokens.json` and is never typed by hand. When the design system changes, regenerate the theme rather than editing the code copy.

## How tokens map to React Native

- **Colours:** two theme objects, `light` and `dark`, taken from `color.tokens[].value`.
  - The `table*`, `card*`, `team-*`, `valid` and `invalid` tokens are table colours. They stay dark in both themes.
  - The felt setting swaps `table` → `table-alt` and `table-raised` → `table-alt-raised`.
- **Type:** `sans` is Atkinson Hyperlegible Next, and `display` is Fraunces (wordmark and court letters only). Both must be bundled with the app through `expo-font`, because Google Fonts links don't work in React Native. Scores use `fontVariant: ['tabular-nums']`.
- **Space, radius and sizes:** plain numbers, so `space-4` (16px) becomes `16`.
- **Shadows:** CSS box-shadows. On iOS each becomes `shadowOffset`, `shadowRadius`, `shadowOpacity` and `shadowColor`; on Android, `elevation`.
- **Motion:** the durations and easing curves from the README's motion table, run with Reanimated. Each animation has its reduce-motion alternative (`AccessibilityInfo.isReduceMotionEnabled`).

## Not yet covered by the design system

- **Landscape and tablet layouts.** The brief asks for both orientations, chosen in Settings, and real tablet layouts. The system only says "tablets scale cards by 1.25".
- **Screen mockups** (home, sign in, table setup, lobby, round summary, settings). The system defines tokens and components, not screens.
- **App icon and logo.** "Buraco" is a placeholder name set in `wordmark`.

Brief that produced it: [claude-design-prompt.md](claude-design-prompt.md).

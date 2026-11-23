# Store asset generator — handover

A ~280-line Python script that turns raw phone screenshots into submission-ready
App Store and Google Play artwork. Built for Salvie; written to be ported.

This doc assumes you are setting it up in a **different app's repo**. It covers what
it makes, what to copy, the dozen lines you must change, and the design rules that
came out of real store-review and feedback rounds — including the mistakes, so you
don't repeat them.

---

## 1. What it produces

One run writes every asset both stores ask for, in every locale:

| Output | Size | Store slot |
|---|---|---|
| `out/ios/<locale>/<slot>.png` | 1320 × 2868 | App Store — iPhone 6.9" (required) |
| `out/ios-6.3/<locale>/<slot>.png` | 1206 × 2622 | App Store — iPhone 6.3"/6.1" (also required) |
| `out/ios-creative/<locale>/header.png` | 3840 × 1646 | App Store — product page header (iOS 27+) |
| `out/ios-creative/<locale>/search-results.png` | 3840 × 2560 | App Store — search results (iOS 27+) |
| `out/android/<locale>/<slot>.png` | 1080 × 1920 | Play — phone screenshots |
| `out/android/<locale>/feature-graphic.png` | 1024 × 500 | Play — feature graphic (required) |
| `out/android/play-icon.png` | 512 × 512 | Play — listing icon |

All outputs are RGB with no alpha channel, which both stores require. The script
asserts this before saving, so a bad export fails loudly rather than at upload.

For Salvie that's 31 files from 8 screenshots in about 13 seconds.

---

## 2. How it works

```
raw/ios/en/02.png          ← your screenshot, pasted untouched
captions.json              ← headline + sub + theme per slot
        │
        ▼
   compose.py               ← draws backdrop, type, device frame
        │
        ▼
out/ios/en/02.png  +  out/ios-6.3/en/02.png  +  out/android/en/02.png
```

Every screenshot slide is laid out once on a **1320-wide canvas**, then resized to
each store's dimensions. That is why one layout serves three sizes: 6.9", 6.3" and
Play all share essentially the same aspect ratio (0.460, 0.460, 0.5625 — the Play
one is cropped by its shorter canvas, not squashed).

The creative assets (header, search results) use a different composition: landscape,
type on the left, device tilted and bleeding out to the right.

---

## 3. Port it in 20 minutes

### 3.1 Copy these files

```
store-assets/
├── compose.py          ← the generator (copy as-is, then edit §3.3)
├── captions.json       ← your copy (rewrite entirely)
└── raw/
    └── ios/
        ├── en/01.png 02.png 03.png 04.png
        └── <locale>/…
```

Add `store-assets/out/` to `.gitignore` — it is ~20 MB of regenerable PNGs. Keep
`raw/` in git; those captures are expensive to reproduce.

### 3.2 Dependencies

Only Pillow, pulled per-run so nothing is added to the project:

```bash
uv run --with pillow python store-assets/compose.py   # from the mobile/ dir
```

Without `uv`: `pip install pillow && python store-assets/compose.py`.

Fonts are read from disk, not installed. Salvie uses the `@expo-google-fonts`
packages already in `node_modules`. If your app doesn't, point `FONTS` at any
directory of `.ttf` files (see below).

### 3.3 The lines that are app-specific

These are the only places Salvie is baked in. Everything else is generic.

| Line | What | Change to |
|---|---|---|
| 30 | `FONTS = MOBILE / "node_modules" / "@expo-google-fonts"` | Wherever your `.ttf` files live |
| 59–63 | Font files: `Fraunces_600SemiBold`, `InterTight_500Medium` | Your display + body faces. Keep a **regular and an italic** of the display face — the italic carries the accent phrase |
| 46–51 | `INK`, `SUB`, `THEMES` | Your palette. Each theme is `bg` (gradient top, bottom) + `em` (accent). Two themes alternate across the set |
| 184–186 | `assets/icon.png` path and the literal `"Salvie"` | Your icon path and app name (feature graphic only) |
| 223 | Comment about the recipe card | Describe whatever your creative-asset screen shows |
| 225 | `sy - round(sh * 0.42)` | Vertical offset of the device in the creative assets — tune until **your** key UI lands in the safe area (§5.3) |

Nothing else needs touching for a first run.

### 3.4 Your first run

1. Drop 4 screenshots into `raw/ios/en/01.png` … `04.png`
2. Write `captions.json` (§4)
3. Run it. Missing captures render a labelled grey placeholder instead of crashing,
   so you can iterate on copy and layout before the screenshots exist
4. Build a contact sheet to judge the set as a row, the way the store shows it:

```python
from PIL import Image
ims = [Image.open(f'out/ios/en/0{i}.png') for i in range(1, 5)]
tw = 330; th = round(2868 * tw / 1320); gap = 12
sheet = Image.new('RGB', (4 * tw + 3 * gap, th), (255, 255, 255))
for i, im in enumerate(ims):
    sheet.paste(im.resize((tw, th), Image.LANCZOS), (i * (tw + gap), 0))
sheet.save('/tmp/sheet.png')
```

Judging slides one at a time is how you end up with a set that doesn't hang together.

---

## 4. captions.json

Top-level keys without a leading underscore are **locales**; each holds the ordered
list of screenshot slides. Keys starting with `_` are config or notes.

```jsonc
{
  "_note": "…",                        // ignored, keep the schema documented here
  "en": [
    {
      "slot": "01",                    // matches raw/<platform>/en/01.png
      "theme": "peach",                // peach | sage — alternate across the set
      "tilt": true,                    // optional; hero slide only
      "headline": "Snap a receipt.\n*Pantry done.*",
      "sub": "Your groceries, added and sorted automatically."
    }
  ],
  "pt-BR": [ … ],                      // same slots, translated

  "_play_feature_graphic": {           // one per locale
    "en": { "slot": "02", "tagline": "Cook with\n*what you have*" }
  },
  "_ios_creative": {                   // header + search results, one per locale
    "en": {
      "slot": "03",
      "tagline": "What's for dinner?\n*Answered.*",
      "sub": "Cook with what you have."
    }
  },
  "_later_no_capture_yet": { … }       // parking lot; never rendered
}
```

**Copy syntax**

| Token | Effect |
|---|---|
| `*phrase*` | Renders in the theme's accent colour, display italic |
| `\n` | Forced line break — use it to control the break instead of trusting the wrap |

**Guardrails.** The script asserts a headline is ≤ 2 lines, a sub is ≤ 2 lines, and
the text block clears the device. Too-long copy fails the run with the slot name and
the offending string. That is deliberate: a three-line headline is unreadable at
gallery thumbnail size, and the store never shows you that before you upload.

---

## 5. Design rules (learned the hard way)

### 5.1 Never tint the backdrop with the app's own background colour

The first version used the app's cream. The screenshots dissolved into the page —
no edge, no contrast, nothing to catch the eye in a scrolling gallery. The backdrop
must *contrast* with the app UI, not match it. Salvie's app is cream, so the
backdrops are saturated pastels (peach, sage-wash) and the device frame is near-black.

### 5.2 Do not edit the screenshots

A version that repainted the status bar to 9:41, cropped the tab bar, and floated
zoomed-in "callout" crops over the device was rejected on sight: fussy, and it reads
as a mock-up rather than the real app. The capture now goes in **pixel-for-pixel**.

If the status bar shows a real clock, a half-full battery or the wrong language,
**retake the screenshot** — don't repair it in the compositor. On iOS:

```bash
xcrun simctl status_bar <device-udid> override --time "9:41" \
  --batteryState charged --batteryLevel 100 --cellularBars 4
```

### 5.3 Creative assets: keep the point inside the safe area

Apple's header and search assets crop differently per device. Only the **art safe
area** is guaranteed visible:

| Asset | Canvas | Safe area (x, y, w, h) |
|---|---|---|
| Header | 3840 × 1646 | 1097, 493, 1646, 661 |
| Search results | 3840 × 2560 (max) | 836, 765, 2168, 1030 |

The headline *and* the UI that proves the headline must both sit inside it. In
Salvie's header the line is "What's for dinner? Answered." so the recipe card — the
answer — is what's positioned in the safe area, not the filter chips above it. The
device deliberately bleeds out of the auxiliary area; that part may be cropped.

Verify before uploading by drawing the rectangle on the output:

```python
from PIL import Image, ImageDraw
im = Image.open('out/ios-creative/en/header.png')
ImageDraw.Draw(im).rectangle((1097, 493, 1097 + 1646, 493 + 661), outline=(255, 0, 0), width=8)
im.resize((1100, 471)).save('/tmp/safe.png')
```

### 5.4 Other decisions worth keeping

- **Fixed `HEAD_Y` and `PHONE_TOP` across every slide.** Headlines and devices line
  up when the gallery is scrolled. Centring each slide's text independently makes the
  row look drunk.
- **The device bleeds off the bottom.** Hides the tab bar and implies there's more app
  below the fold.
- **Tilt exactly one slide** (the hero). Tilting all of them is noisy; tilting none is
  flat.
- **Dynamic Island on iOS only** (`island=platform.startswith("ios")`). Google Play
  discourages iPhone-looking frames in Play listings.
- **Alternate two themes** down the set. Four slides in one colour read as one image.

---

## 6. Store rules the copy must respect

Both stores reject on these, and review is slow enough that it's worth checking once:

- No prices, discounts, URLs or copyright symbols in the artwork
- No unverifiable claims ("#1 app", awards you didn't win)
- No Apple-designated recognitions (Editor's Choice, App of the Day…)
- No logos or references to other platforms or marketplaces
- Artwork must be 4+ appropriate regardless of the app's age rating
- Localize the text for every language the listing supports
- If using text, make it a short phrase that *enhances* the visual, not one that
  describes it

Current spec pages — check them, Apple changed the required sizes in 2026:

- https://developer.apple.com/app-store/asset-best-practices/
- https://developer.apple.com/help/app-store-connect/reference/app-information/creative-assets-specifications

---

## 7. Extending it

**Another locale.** Add the key to `captions.json` and drop captures in
`raw/ios/<locale>/`. Everything downstream iterates over the locale list.

**More slides.** Add entries with new slot numbers. Apple allows up to 10 per locale,
Play 8. Three to five is the norm — people rarely swipe past the third.

**A real Android capture.** Drop it at `raw/android/<locale>/<slot>.png`;
`find_raw()` prefers it automatically and silently falls back to the iOS one until
then, so the Play set is never blocked on having an emulator running.

**Another output size.** Add a row to `PLATFORMS` — `name: (canvas_height, (w, h))`.
That's how 6.3" was added when App Store Connect started demanding it, in one line.

**Apple's Universal creative asset** (5244 × 2950, PNG only, replaces both header and
search) isn't implemented. Add it to `CREATIVE` with its safe area if you want it.

---

## 8. Known rough edges

| Thing | Status |
|---|---|
| App name is a literal in `feature_graphic()` | Move to `captions.json` if you'll maintain several apps |
| Creative assets always use the `peach` theme | Hardcoded in `creative()`; parameterize if you want variants |
| No App Preview videos | Both stores accept them (Apple: 886 × 1920, 15–30 s); out of scope here |
| `__pycache__/` appears next to the script | Harmless; gitignore it |

---

## 9. Checklist for a new app

- [ ] Copy `compose.py` + `captions.json`, add `out/` to `.gitignore`
- [ ] Repoint `FONTS`, swap the two font families (display + italic, body)
- [ ] Replace `INK`, `SUB` and both `THEMES` with the app's palette
- [ ] Update the icon path and app name in `feature_graphic()`
- [ ] Write `captions.json`: 3–5 slots per locale, ≤ 2-line headlines
- [ ] Capture screenshots with a clean status bar, save to `raw/ios/<locale>/`
- [ ] Run, build a contact sheet, judge the set as a row
- [ ] Tune the creative-asset device offset until the key UI is in the safe area
- [ ] Verify safe areas with the rectangle overlay
- [ ] Confirm outputs are RGB and the right sizes (the asserts do this)

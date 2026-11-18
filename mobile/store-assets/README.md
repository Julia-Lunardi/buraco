# Store artwork

`compose.py` turns raw screenshots into every image the App Store and Google Play
ask for, in pt-BR, en and da. One run writes 136 files in about half a minute.

```bash
cd mobile
uv run --with pillow python store-assets/compose.py
```

Copy lives in `captions.json`; nothing is baked into the script except the app name
and the palette. The method, the design rules and the store rules behind all of this
are in [docs/design/creative_assets_handover.md](../../docs/design/creative_assets_handover.md) —
read §5 before changing the layout.

## What it writes

| Output | Size | Store slot |
|---|---|---|
| `out/ios/<locale>/<slot>.png` | 1320 × 2868 | iPhone 6.9" — **required** |
| `out/ios-6.3/<locale>/<slot>.png` | 1206 × 2622 | iPhone 6.3"/6.1" — **required** |
| `out/ipad-13/<locale>/<slot>.png` | 2064 × 2752 | iPad 13" — **required**, `supportsTablet` is on |
| `out/ipad-13-ls/<locale>/<slot>.png` | 2752 × 2064 | iPad 13", landscape |
| `out/android/<locale>/<slot>.png` | 1080 × 1920 | Play phone |
| `out/android-tablet-7/<locale>/<slot>.png` | 1920 × 1200 | Play 7" tablet |
| `out/android-tablet-10/<locale>/<slot>.png` | 2560 × 1600 | Play 10" tablet |
| `out/android/<locale>/feature-graphic.png` | 1024 × 500 | Play feature graphic — **required** |
| `out/android/play-icon.png` | 512 × 512 | Play listing icon |
| `out/ios-creative/<locale>/header.png` | 3840 × 1646 | App Store product page header (iOS 27+) |
| `out/ios-creative/<locale>/search-results.png` | 3840 × 2560 | App Store search results (iOS 27+) |

`out/` is gitignored. Every file is RGB with no alpha, and the script asserts sizes
and line counts before saving, so a bad run fails loudly instead of at upload.
Play screenshots stay at 1.6:1, inside Play's 2:1 limit — Salvie's 2.06:1 images
were rejected.

## The captures

Drop them in `raw/<kind>/<locale>/<slot>.png`, **pixel for pixel, never edited**.
A missing capture renders a labelled placeholder, so copy and layout can be judged
before any screenshot exists.

| Kind | Device | Falls back to |
|---|---|---|
| `phone-ios` | iPhone 16 Pro Max portrait | — (the one set you cannot do without) |
| `phone-ios-ls` | iPhone landscape | — |
| `phone-android` | Pixel 9 portrait | `phone-ios` |
| `tablet-ios` | iPad Pro 13" portrait | `phone-ios` |
| `tablet-ios-ls` | iPad Pro 13" landscape | `phone-ios-ls` |
| `tablet-android-ls` | Pixel Tablet landscape | `tablet-ios-ls` |

What each slot shows is in `captions.json` under `_slots`.

### Capturing on the iOS simulator

**Build Release, not debug.** A debug build paints expo-dev-client's floating "Tools"
bubble over the UI, and §5.2 forbids editing it out of the capture:

```bash
cd mobile
npx expo run:ios --configuration Release --device <device-udid>
```

Clean the status bar **before** capturing, never after. It survives app reinstalls:

```bash
xcrun simctl status_bar <device-udid> override --time "9:41" \
  --batteryState charged --batteryLevel 100 --cellularBars 4 --dataNetwork wifi --wifiBars 3
xcrun simctl io <device-udid> screenshot --type png raw/phone-ios/en/01.png
```

Dark mode for slot 06 needs no navigation — the app's theme follows the system by
default, so flip the simulator: `xcrun simctl ui <device-udid> appearance dark`.

**Three things that waste an hour if you don't know them** (all hit on 17 Nov 2026,
iOS 26.4 runtime, device set on the external SalvieDev volume):

- `xcrun simctl bootstatus` never returns on this runtime even though the device is
  up and usable. Boot with `simctl boot` and poll `simctl list devices` for `(Booted)`.
- Two `simctl io … screenshot` calls at once deadlock CoreSimulator, and every later
  call then hangs. Take one at a time; if it wedges,
  `killall -9 com.apple.CoreSimulator.CoreSimulatorService` (this closes every open
  simulator window).
- `simctl io … screenshot` needs an **absolute** output path; a relative one fails
  with "Read-only file system".

### Game states for the captures

Screens like a mid-game table or a lobby with a friend in it are seeded through the
real API against a local backend, rather than played by hand:

```bash
cd backend && make db && make migrate && make dev     # Postgres 5434, API 8001
# point mobile/.env at EXPO_PUBLIC_API_URL=http://127.0.0.1:8001 and rebuild
```

Sign in as a guest in the app, then seed that account: the helper promotes the newest
user to a full account (what a Google sign-in produces, so friend tables are allowed),
creates the tables and plays out the moves with the engine's own sharp bot through
`/hint`, stopping on your turn with melds down and a non-zero match score.

```bash
cd backend
uv run python ../mobile/store-assets/seed_app_user.py Emma Sam      # me, the friend
uv run python ../mobile/store-assets/advance.py <token> <table-id>  # push a table further
```

| Script | What it is for |
|---|---|
| `seed_app_user.py` | Seeds slots 01/06, 05 and 03 onto the account the app just created. Run it from `backend/`: it imports the backend's own token helper rather than re-implementing one. Pass the names that should appear at the table — localise them per locale: `Emma Sam` for en, `Ana Marina` for pt-BR, `Freja Mads` for da. A Brazilian player reading "Freja took the morto" notices |
| `seed_friends.py` | A life with friends for the Home and table shots: four test friends and five tables, all async so nothing moves while you capture. Aberto in round 2 on your turn with a chat and reactions, a 4-player Fechado on their turn, STBL on your turn, a "Bate com limpa" Aberto in round 3, and a lobby with a friend and an open seat. Every seat is played by the engine's bot through the backend's services, so friend tables work too (`/hint` only serves practice games). `--locale pt-BR|en|da` picks names and chat (`-en`/`-da` as shortcuts), `--me` your name. It seeds the newest *guest* account, so sign in as a guest in the app first. Run it from `backend/` |
| `advance.py` | Plays an existing table further: past a round end, so the score chips carry a real match score |
| `tap.py` | Taps or swipes the simulator at a point in *device pixels* — the same coordinates you read off a screenshot. `uv run --with pyobjc-framework-Quartz python3 tap.py <x> <y>` |

## Checking before upload

Judge the set as a row, the way the store shows it — never one slide at a time:

```python
from PIL import Image
ims = [Image.open(f'out/ios/en/0{i}.png') for i in range(1, 7)]
tw = 300; th = round(2868 * tw / 1320); gap = 10
sheet = Image.new('RGB', (6 * tw + 5 * gap, th), (255, 255, 255))
for i, im in enumerate(ims):
    sheet.paste(im.resize((tw, th), Image.LANCZOS), (i * (tw + gap), 0))
sheet.save('/tmp/sheet.png')
```

And confirm the creative assets keep the point inside Apple's art safe area — for
Buraco that is the "Your turn" notice row and your own melds, which is what
`CREATIVE_FOCUS` positions. **Re-check this once real captures exist**; the value is
tuned against placeholders:

```python
from PIL import Image, ImageDraw
im = Image.open('out/ios-creative/en/header.png')
ImageDraw.Draw(im).rectangle((1097, 493, 1097 + 1646, 493 + 661), outline=(255, 0, 0), width=8)
im.resize((1100, 471)).save('/tmp/safe.png')
```

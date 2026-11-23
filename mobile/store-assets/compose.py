"""Compose store assets for the App Store (iOS) and Google Play (Android).

Usage (from mobile/):
    uv run --with pillow python store-assets/compose.py

Inputs:  captions.json, raw/<kind>/<locale>/<slot>.png — captures pasted untouched.
         Capture kinds, each falling back to the next when it doesn't exist yet:
           phone-ios            iPhone portrait (the one set you cannot do without)
           phone-ios-ls         iPhone landscape
           phone-android        Pixel portrait        → falls back to phone-ios
           tablet-ios           iPad portrait         → falls back to phone-ios
           tablet-ios-ls        iPad landscape        → falls back to phone-ios-ls
           tablet-android-ls    Pixel Tablet landscape → falls back to tablet-ios-ls

Outputs: out/ios/<locale>/<slot>.png                 1320x2868  iPhone 6.9" (required)
         out/ios-6.3/<locale>/<slot>.png             1206x2622  iPhone 6.3"/6.1" (required)
         out/ipad-13/<locale>/<slot>.png             2064x2752  iPad 13" (required: supportsTablet)
         out/ipad-13-ls/<locale>/<slot>.png          2752x2064  iPad 13" landscape
         out/android/<locale>/<slot>.png             1080x1920  Play phone
         out/android-tablet-7/<locale>/<slot>.png    1920x1200  Play 7" tablet (1.6:1, under Play's 2:1)
         out/android-tablet-10/<locale>/<slot>.png   2560x1600  Play 10" tablet
         out/android/<locale>/feature-graphic.png    1024x500   Play (required)
         out/android/play-icon.png                   512x512    Play listing icon
         out/ios-creative/<locale>/header.png        3840x1646  App Store product page header
         out/ios-creative/<locale>/search-results.png 3840x2560 App Store search results
All outputs are RGB (no alpha). A missing capture renders a labelled placeholder.

Design: warm backdrops alternating sand / clay — deliberately *not* the app's own
cream (#f6f2ea) or green felt (#275243), so the capture has an edge in a scrolling
gallery. Ink headline with the key phrase in the slide's accent, one-line benefit,
dark device frame (Dynamic Island on iOS only; Play discourages iPhone-looking
frames) bleeding off the bottom. Portrait slides keep one headline size per locale
so the gallery row lines up; landscape slides put type left, device right.
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).resolve().parent
MOBILE = HERE.parent
FONTS = MOBILE / "node_modules" / "@expo-google-fonts"
APP_NAME = "Buraco Lounge"

DISPLAY = "fraunces/600SemiBold/Fraunces_600SemiBold.ttf"
DISPLAY_IT = "fraunces/600SemiBold_Italic/Fraunces_600SemiBold_Italic.ttf"
BODY = "atkinson-hyperlegible-next/500Medium/AtkinsonHyperlegibleNext_500Medium.ttf"

# Palette from docs/design/tokens.json: ink / ink-soft for type, accent-ink and
# team-b-ink as the two accents. The washes are warm because the listing's whole
# pitch is "hygge med vennerne"; both still contrast with the green felt.
INK = (35, 32, 27)          # ink (light)
SUB = (104, 97, 86)         # ink-soft (light)
THEMES = {
    "sand": dict(bg=((252, 240, 214), (246, 224, 172)), em=(138, 93, 12)),   # accent-ink
    "clay": dict(bg=((246, 223, 209), (232, 192, 170)), em=(173, 73, 26)),   # team-b-ink, deepened
}
RIM, BEZEL_C, SHADOW_C = (142, 140, 132), (22, 22, 24), (20, 16, 10)

# Every portrait layout is drawn on a 1320-wide canvas (phones) or at the output
# size (tablets), with metrics as fractions so the two look identical.
BASE_W = 1320
PLATFORMS = {
    "ios":               dict(out=(1320, 2868), kind="portrait", island=True, cap="phone",
                              raw=["phone-ios"]),
    "ios-6.3":           dict(out=(1206, 2622), kind="portrait", island=True, cap="phone",
                              raw=["phone-ios"]),
    "ipad-13":           dict(out=(2064, 2752), kind="portrait", island=False, exact=True, cap="tablet",
                              raw=["tablet-ios"]),
    "ipad-13-ls":        dict(out=(2752, 2064), kind="landscape", island=False, exact=True, cap="tablet-ls",
                              raw=["tablet-ios-ls"]),
    "android":           dict(out=(1080, 1920), kind="portrait", island=False, cap="phone",
                              raw=["phone-android", "phone-ios"]),
    "android-tablet-7":  dict(out=(1920, 1200), kind="landscape", island=False, exact=True, cap="tablet-ls",
                              raw=["tablet-android-ls", "tablet-ios-ls"]),
    "android-tablet-10": dict(out=(2560, 1600), kind="landscape", island=False, exact=True, cap="tablet-ls",
                              raw=["tablet-android-ls", "tablet-ios-ls"]),
}

# Portrait metrics, as fractions of the canvas. HEAD_Y and PHONE_TOP are fixed per
# canvas, never centred per slide: the gallery row has to line up.
P = dict(margin=0.0636, head_y=0.0732, phone_top=0.3208, screen_w=0.7576,
         head=0.0909, head_lh=0.1000, sub=0.0364, sub_lh=0.0470, gap=0.0182)
# Landscape metrics: type left, device right, bleeding off the right edge.
L = dict(margin=0.0500, col=0.3400, text_top=0.2600, dev_x=0.4400, dev_w=0.7000,
         head=0.0620, sub=0.0210, gap=0.0170)
TILT_DEG = -7
TILT_SCALE = 0.93   # a tilted device is wider; shrink it or the corners clip the canvas

# Placeholder shapes match the capture each platform expects, so a set with no
# captures yet still previews at the right proportions.
PLACEHOLDERS = {"phone": (1179, 2556), "phone-ls": (2556, 1179),
                "tablet": (2064, 2752), "tablet-ls": (2752, 2064)}


def font(rel, size):
    return ImageFont.truetype(str(FONTS / rel), size)


# ---------- text ----------

def tokens(text):
    """'Hygge med\\n*vennerne*' -> [(word, emphasised) ...]; None = forced line break."""
    out, em = [], False
    for part in text.split("*"):
        for i, para in enumerate(part.split("\n")):
            if i:
                out.append(None)
            out += [(w, em) for w in para.split()]
        em = not em
    return out


def wrap(draw, toks, max_w, f, f_em):
    space = draw.textlength(" ", font=f)

    def width(ln):
        return sum(draw.textlength(w, font=f_em if e else f) for w, e in ln) + space * (len(ln) - 1)

    lines, line = [], []
    for t in toks:
        if t is None or (line and width(line + [t]) > max_w):
            lines.append(line)
            line = []
        if t is not None:
            line.append(t)
    lines.append(line)
    return lines, width, space


def balance(draw, toks, max_w, f, f_em):
    """Narrowest width that still fits in the same number of lines, so a two-line sub
    breaks near the middle instead of leaving one word stranded ('…4 in / pairs.')."""
    target = len(wrap(draw, toks, max_w, f, f_em)[0])
    lo, hi = 1, max_w
    while lo < hi:
        mid = (lo + hi) // 2
        if len(wrap(draw, toks, mid, f, f_em)[0]) <= target:
            hi = mid
        else:
            lo = mid + 1
    return lo


def draw_rich(draw, x0, y, text, max_w, f, f_em, line_h, color, em_color, center=True, even=False):
    """Draw wrapped text; *emphasis* in em_color. Returns (next y, line count)."""
    toks = tokens(text)
    lines, width, space = wrap(draw, toks, balance(draw, toks, max_w, f, f_em) if even else max_w,
                               f, f_em)
    for ln in lines:
        x = x0 + ((max_w - width(ln)) / 2 if center else 0)
        for w, em in ln:
            ff = f_em if em else f
            draw.text((x, y), w, font=ff, fill=em_color if em else color)
            x += draw.textlength(w, font=ff) + space
        y += line_h
    return y, len(lines)


def lines_at(draw, text, max_w, f, f_em):
    return len(wrap(draw, tokens(text), max_w, f, f_em)[0])


def best_size(draw, texts, max_w, start, floor, max_lines, italic=True):
    """Largest size (one per locale, so the row stays even) that keeps every string
    inside max_lines. Falls back to floor rather than crashing."""
    for size in range(start, floor - 1, -2):
        f = font(DISPLAY if italic else BODY, size)
        f_em = font(DISPLAY_IT, size) if italic else f
        if all(lines_at(draw, t, max_w, f, f_em) <= max_lines for t in texts):
            return size
    return floor


# ---------- image helpers ----------

def rounded_mask(size, radius):
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), radius, fill=255)
    return m


def vgrad(w, h, top, bottom):
    g = Image.linear_gradient("L").resize((w, h))
    return Image.composite(Image.new("RGB", (w, h), bottom), Image.new("RGB", (w, h), top), g)


def placeholder(slot, label, cap="phone"):
    w, h = PLACEHOLDERS[cap]
    img = Image.new("RGB", (w, h), (246, 242, 234))
    ImageDraw.Draw(img).multiline_text((w / 2, h / 2), f"{slot}\n{label}\n(raw capture missing)",
                                       font=font(BODY, round(w * 0.04)), fill=SUB, anchor="mm",
                                       align="center", spacing=round(w * 0.018))
    return img


def device(shot, screen_w, island):
    """Dark frame with a titanium rim, thin bezel and (iOS phones) a Dynamic Island.
    Returns RGBA. The capture itself is only resized, never edited."""
    shot = shot.resize((screen_w, round(shot.height * screen_w / shot.width)), Image.LANCZOS)
    short = min(screen_w, shot.height)
    bez, rim = round(short * 0.02), max(3, round(short * 0.005))
    r = round(short * 0.105)
    pw, ph = shot.width + 2 * (bez + rim), shot.height + 2 * (bez + rim)
    img = Image.new("RGBA", (pw, ph), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((0, 0, pw - 1, ph - 1), r + bez + rim, fill=RIM + (255,))
    d.rounded_rectangle((rim, rim, pw - rim - 1, ph - rim - 1), r + bez, fill=BEZEL_C + (255,))
    img.paste(shot, (rim + bez, rim + bez), rounded_mask(shot.size, r))
    if island:
        iw, ih = round(screen_w * 0.21), round(screen_w * 0.062)
        cx, top = pw // 2, rim + bez + round(screen_w * 0.026)
        d.rounded_rectangle((cx - iw // 2, top, cx + iw // 2, top + ih), ih // 2, fill=(0, 0, 0, 255))
    return img


def paste_with_shadow(canvas, layer, xy, blur, dy, alpha):
    """Paste an RGBA layer with a soft drop shadow derived from its alpha."""
    sh = Image.new("L", canvas.size, 0)
    sh.paste(layer.split()[3].point(lambda v: v * alpha // 255), (xy[0], xy[1] + dy))
    canvas = Image.composite(Image.new("RGB", canvas.size, SHADOW_C), canvas,
                             sh.filter(ImageFilter.GaussianBlur(blur)))
    canvas.paste(layer, xy, layer)
    return canvas


# ---------- compositions ----------

def portrait(entry, raw, size, island, m):
    w, h = size
    theme = THEMES[entry.get("theme", "sand")]
    canvas = vgrad(w, h, *theme["bg"])
    d = ImageDraw.Draw(canvas)
    margin = m["margin"]
    max_w = w - 2 * margin
    phone_top = m["phone_top"]

    f, f_em = font(DISPLAY, m["head"]), font(DISPLAY_IT, m["head"])
    y, n = draw_rich(d, margin, m["head_y"], entry["headline"], max_w, f, f_em,
                     m["head_lh"], INK, theme["em"])
    assert n <= 2, f"headline wraps to {n} lines in slot {entry['slot']}: {entry['headline']!r}"
    if entry.get("sub"):
        fs = font(BODY, m["sub"])
        y, n = draw_rich(d, margin, y + m["gap"], entry["sub"], max_w, fs, fs,
                         m["sub_lh"], SUB, SUB, even=True)
        assert n <= 2, f"sub wraps to {n} lines in slot {entry['slot']}: {entry['sub']!r}"
    assert y <= phone_top, f"text block too tall in slot {entry['slot']}"

    if entry.get("tilt"):
        phone = device(raw, round(m["screen_w"] * TILT_SCALE), island)
        phone = phone.rotate(TILT_DEG, resample=Image.BICUBIC, expand=True)
        return paste_with_shadow(canvas, phone, ((w - phone.width) // 2, phone_top - round(h * 0.014)),
                                 round(w * 0.053), round(w * 0.030), 170)
    phone = device(raw, m["screen_w"], island)
    return paste_with_shadow(canvas, phone, ((w - phone.width) // 2, phone_top),
                             round(w * 0.045), round(w * 0.027), 150)


def landscape(entry, raw, size, island, m):
    """Tablet slides: type in the left column, device on the right bleeding off the edge.
    The text block is centred on the same y for every slide in a set (m["text_top"])."""
    w, h = size
    theme = THEMES[entry.get("theme", "sand")]
    canvas = vgrad(w, h, *theme["bg"])
    d = ImageDraw.Draw(canvas)
    x0, col = m["margin"], m["col"]

    f, f_em = font(DISPLAY, m["head"]), font(DISPLAY_IT, m["head"])
    fs = font(BODY, m["sub"])
    y, n = draw_rich(d, x0, m["text_top"], entry["headline"], col, f, f_em, m["head_lh"],
                     INK, theme["em"], center=False)
    assert n <= 2, f"landscape headline wraps to {n} lines in slot {entry['slot']}"
    if entry.get("sub"):
        _, n = draw_rich(d, x0, y + m["gap"], entry["sub"], col, fs, fs, m["sub_lh"], SUB, SUB,
                         center=False, even=True)
        assert n <= 2, f"landscape sub wraps to {n} lines in slot {entry['slot']}"

    dev = device(raw, m["dev_w"], island)
    return paste_with_shadow(canvas, dev, (m["dev_x"], (h - dev.height) // 2),
                             round(w * 0.022), round(w * 0.013), 150)


def feature_graphic(tagline, shot, theme_name="sand"):
    """Play feature graphic, 1024x500: icon + app name + tagline left, device right."""
    fw, fh = 1024, 500
    theme = THEMES[theme_name]
    canvas = vgrad(fw, fh, *theme["bg"])
    d = ImageDraw.Draw(canvas)
    icon = Image.open(MOBILE / "assets" / "icon.png").convert("RGB").resize((104, 104), Image.LANCZOS)
    canvas.paste(icon, (64, 92), rounded_mask(icon.size, 24))
    # "Buraco Lounge" is longer than the device column allows at Salvie's 64px.
    name_x, name_room = 190, 650 - 190 - 24
    size = next(s for s in range(60, 31, -2) if d.textlength(APP_NAME, font=font(DISPLAY, s)) <= name_room)
    f_name = font(DISPLAY, size)
    d.text((name_x, 112 + (64 - size) // 2), APP_NAME, font=f_name, fill=INK)
    tag_size = best_size(d, [tagline], 520, 54, 36, 2)
    draw_rich(d, 64, 240, tagline, 520, font(DISPLAY, tag_size), font(DISPLAY_IT, tag_size),
              round(tag_size * 1.22), INK, theme["em"], center=False)
    return paste_with_shadow(canvas, device(shot, 300, False), (650, 60), 24, 14, 150)


CREATIVE = {
    # App Store creative assets (iOS 27+ product page header / search results).
    # name: (size, art safe area (x, y, w, h)) — critical elements stay inside it.
    "header": ((3840, 1646), (1097, 493, 1646, 661)),
    "search-results": ((3840, 2560), (836, 765, 2168, 1030)),
}
# The device is sized and shifted so that FOCUS (a fraction down the screen) sits in
# the middle of the safe area. Buraco's proof of "it's your turn" is the notice row
# and your own melds, which sit about two thirds down the Table screen — not the top,
# as in Salvie. Re-check with the rectangle overlay when real captures land.
CREATIVE_DEV_W, CREATIVE_FOCUS = 1.81, 0.66


def creative(name, tagline, sub, shot, theme_name="sand"):
    (w, h), (sx, sy, sw, sh) = CREATIVE[name]
    theme = THEMES[theme_name]
    canvas = vgrad(w, h, *theme["bg"])
    d = ImageDraw.Draw(canvas)
    col_w = round(sw * 0.56)
    size = best_size(d, [tagline], col_w, round(sh * 0.24), round(sh * 0.08), 2)
    f, fi = font(DISPLAY, size), font(DISPLAY_IT, size)
    fs = font(BODY, round(size * 0.42))
    sub_lh = round(size * 0.55)
    n = lines_at(d, tagline, col_w, f, fi)
    block_h = n * round(size * 1.1) + (sub_lh + round(size * 0.2) if sub else 0)
    ty = sy + (sh - block_h) // 2
    ty, _ = draw_rich(d, sx, ty, tagline, col_w, f, fi, round(size * 1.1), INK, theme["em"], center=False)
    if sub:
        draw_rich(d, sx, ty + round(size * 0.2), sub, col_w, fs, fs, sub_lh, SUB, SUB,
                  center=False, even=True)
    phone = device(shot, round(sh * CREATIVE_DEV_W), True)
    phone = phone.rotate(-8, resample=Image.BICUBIC, expand=True)
    return paste_with_shadow(canvas, phone,
                             (sx + round(sw * 0.52), sy + sh // 2 - round(phone.height * CREATIVE_FOCUS)),
                             60, 36, 150)


# ---------- main ----------

def find_raw(kinds, locale, slot):
    """Return (image, capture kind). Tries each kind in order, newest-specific first."""
    for kind in kinds:
        p = HERE / "raw" / kind / locale / f"{slot}.png"
        if p.exists():
            return Image.open(p).convert("RGB"), kind
    return None, None


def metrics(spec, size, entries, d):
    """One set of metrics per platform and locale — type sizes, the headline y and the
    device y are shared by every slide in the set, so a scrolled gallery row lines up
    (§5.4). Only the device's top floats, and only to make room for the tallest text
    block in the set: the iPad's 3:4 canvas gives the type less vertical room than the
    phone's 9:19.5, and Danish runs longer than English."""
    w, h = size
    if spec["kind"] == "landscape":
        m = dict(margin=round(w * L["margin"]), col=round(w * L["col"]),
                 dev_x=round(w * L["dev_x"]), dev_w=round(w * L["dev_w"]))
        m["head"] = best_size(d, [e["headline"] for e in entries], m["col"],
                              round(w * L["head"]), round(w * L["head"] * 0.62), 2)
        subs = [e["sub"] for e in entries if e.get("sub")]
        m["sub"] = best_size(d, subs, m["col"], round(w * L["sub"]), round(w * L["sub"] * 0.72), 2,
                             italic=False) if subs else round(w * L["sub"])
        m["head_lh"], m["sub_lh"] = round(m["head"] * 1.10), round(m["sub"] * 1.30)
        m["gap"] = round(m["head"] * 0.22)
        block = max(lines_at(d, e["headline"], m["col"], font(DISPLAY, m["head"]),
                             font(DISPLAY_IT, m["head"])) * m["head_lh"]
                    + (m["gap"] + lines_at(d, e["sub"], m["col"], font(BODY, m["sub"]),
                                           font(BODY, m["sub"])) * m["sub_lh"] if e.get("sub") else 0)
                    for e in entries)
        m["text_top"] = max(round(h * L["text_top"] * 0.5), (h - block) // 2)
        return m

    m = dict(margin=round(w * P["margin"]), screen_w=round(w * P["screen_w"]),
             head_y=round(h * P["head_y"]), gap=round(w * P["gap"]))
    col = w - 2 * m["margin"]
    m["head"] = best_size(d, [e["headline"] for e in entries], col,
                          round(w * P["head"]), round(w * P["head"] * 0.62), 2)
    subs = [e["sub"] for e in entries if e.get("sub")]
    m["sub"] = best_size(d, subs, col, round(w * P["sub"]), round(w * P["sub"] * 0.72), 2,
                         italic=False) if subs else round(w * P["sub"])
    m["head_lh"], m["sub_lh"] = round(m["head"] * 1.10), round(m["sub"] * 1.29)
    block = max(lines_at(d, e["headline"], col, font(DISPLAY, m["head"]),
                         font(DISPLAY_IT, m["head"])) * m["head_lh"]
                + (m["gap"] + lines_at(d, e["sub"], col, font(BODY, m["sub"]),
                                       font(BODY, m["sub"])) * m["sub_lh"] if e.get("sub") else 0)
                for e in entries)
    m["phone_top"] = max(round(h * P["phone_top"]), m["head_y"] + block + round(w * 0.06))
    return m


def work_canvas(spec):
    """Canvas to lay out on: the output size for tablets, a 1320-wide proportional
    canvas for phones so all three phone sizes share one layout."""
    ow, oh = spec["out"]
    if spec.get("exact"):
        return (ow, oh)
    return (BASE_W, round(BASE_W * oh / ow))


def main():
    captions = json.loads((HERE / "captions.json").read_text())
    locales = [k for k in captions if not k.startswith("_")]
    # `compose.py en pt-BR` builds just those: a locale whose captures do not exist
    # yet keeps its copy in captions.json without rendering placeholder artwork.
    args = [a for a in sys.argv[1:] if a != "--placeholders"]
    placeholders = "--placeholders" in sys.argv
    if args:
        wanted = args
        missing = [l for l in wanted if l not in locales]
        if missing:
            raise SystemExit(f"no such locale in captions.json: {', '.join(missing)}")
        locales = wanted
    d0 = ImageDraw.Draw(Image.new("RGB", (8, 8)))
    made = 0

    for platform, spec in PLATFORMS.items():
        w, h = work_canvas(spec)
        land = spec["kind"] == "landscape"
        for locale in locales:
            entries = captions[locale]
            if not placeholders and not any(find_raw(spec["raw"], locale, e["slot"])[0] is not None
                                            for e in entries):
                print(f"{platform}/{locale}: skipped — no {spec['cap']} captures yet "
                      f"(raw/{spec['raw'][0]}/{locale}/). Pass --placeholders to lay it out anyway.")
                continue
            m = metrics(spec, (w, h), entries, d0)
            out_dir = HERE / "out" / platform / locale
            out_dir.mkdir(parents=True, exist_ok=True)
            for e in entries:
                raw, src = find_raw(spec["raw"], locale, e["slot"])
                shot = raw if raw is not None else placeholder(e["slot"], e["headline"].replace("*", ""),
                                                               spec["cap"])
                compose = landscape if land else portrait
                img = compose(e, shot, (w, h), spec["island"], m)
                if img.size != tuple(spec["out"]):
                    img = img.resize(tuple(spec["out"]), Image.LANCZOS)
                assert img.size == tuple(spec["out"]) and img.mode == "RGB"
                img.save(out_dir / f"{e['slot']}.png", optimize=True)
                made += 1
                print(f"{platform}/{locale}/{e['slot']}.png  {'from ' + src if src else 'PLACEHOLDER'}")

    # Google Play feature graphic
    for locale in locales:
        meta = captions["_play_feature_graphic"][locale]
        raw, src = find_raw(["phone-android", "phone-ios"], locale, meta["slot"])
        img = feature_graphic(meta["tagline"],
                              raw if raw is not None else placeholder(meta["slot"], "", "phone"),
                              meta.get("theme", "sand"))
        assert img.size == (1024, 500) and img.mode == "RGB"
        img.save(HERE / "out" / "android" / locale / "feature-graphic.png", optimize=True)
        made += 1
        print(f"android/{locale}/feature-graphic.png  {'from ' + src if src else 'PLACEHOLDER'}")

    # App Store creative assets (header + search results), per locale
    for locale in locales:
        meta = captions["_ios_creative"][locale]
        raw, src = find_raw(["phone-ios"], locale, meta["slot"])
        shot = raw if raw is not None else placeholder(meta["slot"], "", "phone")
        out_dir = HERE / "out" / "ios-creative" / locale
        out_dir.mkdir(parents=True, exist_ok=True)
        for name, (size, _) in CREATIVE.items():
            img = creative(name, meta["tagline"], meta.get("sub"), shot, meta.get("theme", "sand"))
            assert img.size == size and img.mode == "RGB"
            img.save(out_dir / f"{name}.png", optimize=True)
            made += 1
            print(f"ios-creative/{locale}/{name}.png  {size[0]}x{size[1]}")

    icon = Image.open(MOBILE / "assets" / "icon.png").convert("RGB").resize((512, 512), Image.LANCZOS)
    icon.save(HERE / "out" / "android" / "play-icon.png", optimize=True)
    made += 1
    print(f"android/play-icon.png\n{made} files")


if __name__ == "__main__":
    main()

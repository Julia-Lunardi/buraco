"""Check every generated file against what the stores accept, independently of the
asserts inside compose.py — wrong sizes and stray alpha fail at upload, after review.

  uv run --with pillow python store-assets/verify.py        # from mobile/
"""
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
EXPECT = {"ios": (1320, 2868), "ios-6.3": (1206, 2622), "ipad-13": (2064, 2752),
          "ipad-13-ls": (2752, 2064), "android": (1080, 1920),
          "android-tablet-7": (1920, 1200), "android-tablet-10": (2560, 1600)}
FIXED = {"feature-graphic.png": (1024, 500), "play-icon.png": (512, 512),
         "header.png": (3840, 1646), "search-results.png": (3840, 2560)}


def main():
    out = HERE / "out"
    problems, n = [], 0
    for p in sorted(out.rglob("*.png")):
        im = Image.open(p)
        n += 1
        rel = p.relative_to(out)
        platform = rel.parts[0]
        expected = FIXED.get(p.name) or EXPECT[platform]
        if im.size != expected:
            problems.append(f"{rel}: {im.size}, expected {expected}")
        if im.mode != "RGB":
            problems.append(f"{rel}: mode {im.mode} — both stores reject an alpha channel")
        # Play's 2:1 limit is for screenshots; the feature graphic is a fixed 1024x500.
        if platform.startswith("android") and p.name not in FIXED:
            ratio = max(im.size) / min(im.size)
            if ratio > 2.0:
                problems.append(f"{rel}: {ratio:.2f}:1 is over Play's 2:1 limit")

    print(f"{n} files checked")
    for problem in problems:
        print("FAIL", problem)
    print("sizes, colour modes and Play aspect limits all OK" if not problems
          else f"{len(problems)} problems")
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())

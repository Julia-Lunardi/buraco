"""Every listing field against the limit its console enforces, before you paste it.

  python3 docs/store/check.py

Limits are counted in characters, not bytes: 'ç' is one. App Store Connect silently
truncates nothing — it refuses to save, so a field that is one character over costs a
round trip through the form.
"""
from pathlib import Path

HERE = Path(__file__).resolve().parent
LIMITS = {
    "app-store/name": 30,          # App Store Connect > App Information > Name
    "app-store/subtitle": 30,      # ...> Subtitle. Indexed by Apple search.
    "app-store/promotional": 170,  # ...> Promotional Text. Editable without a review.
    "app-store/keywords": 100,     # ...> Keywords. Comma-separated, no spaces after commas.
    "app-store/description": 4000,
    "app-store/whats-new": 4000,
    "google-play/title": 30,       # Play Console > Main store listing > App name
    "google-play/short": 80,
    "google-play/full": 4000,
    "google-play/whats-new": 500,  # Play Console > Release > Release notes
}
LOCALES = ("en", "pt-BR")


def main():
    problems, n = [], 0
    for field, limit in LIMITS.items():
        for loc in LOCALES:
            p = HERE / f"{field}-{loc}.txt"
            if not p.exists():
                problems.append(f"{field}-{loc}.txt: missing")
                continue
            text = p.read_text(encoding="utf-8").rstrip("\n")
            n += 1
            room = limit - len(text)
            flag = "FAIL" if room < 0 else "    "
            print(f"{flag} {field+'-'+loc:34} {len(text):5}/{limit:<5} {room:+5} left")
            if room < 0:
                problems.append(f"{field}-{loc}: {len(text)} over the {limit} limit")
            if field.endswith("keywords") and ", " in text:
                problems.append(f"{field}-{loc}: a space after a comma wastes a keyword character")
    print(f"\n{n} fields checked")
    for problem in problems:
        print("FAIL", problem)
    print("every field fits" if not problems else f"{len(problems)} problems")
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())

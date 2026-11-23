# Store listings

Every field both consoles ask for, as a file you paste verbatim. Lengths are checked:

```bash
python3 docs/store/check.py
```

The artwork is generated separately — see [mobile/store-assets/README.md](../../mobile/store-assets/README.md).
Danish is in the app but not in this round: the listings go up in English and Portuguese (Brazil) first.

## App Store Connect

Per language (English (U.S.) and Portuguese (Brazil)):

| Field | Limit | File |
|---|---|---|
| Name | 30 | `app-store/name-<loc>.txt` |
| Subtitle | 30 | `app-store/subtitle-<loc>.txt` |
| Promotional Text | 170 | `app-store/promotional-<loc>.txt` |
| Keywords | 100 | `app-store/keywords-<loc>.txt` |
| Description | 4000 | `app-store/description-<loc>.txt` |
| What's New | 4000 | `app-store/whats-new-<loc>.txt` |

**Subtitle and Keywords are indexed; the Description is not.** So the subtitle never repeats a
word the name already has ("Buraco Lounge" owns *buraco*), and the keywords never repeat the
subtitle. Keywords are comma-separated with no space after the comma — a space costs a character
and buys nothing.

**Promotional Text sits above the description and can be changed without a review.** It is the
one place to say something seasonal without resubmitting the binary.

Once, not per language:

| Field | Value |
|---|---|
| Bundle ID | `com.buraco.app` |
| Primary category | Games → Card |
| Secondary category | Games → Family *(optional; leave empty if you'd rather not compete there)* |
| Privacy Policy URL | https://salviacodelabs.com/buraco/privacy |
| EULA / Terms | https://salviacodelabs.com/buraco/terms *(standard Apple EULA is fine; link yours if you prefer)* |
| Support URL | **needed** — Apple rejects a listing without one, and it has to resolve |
| Marketing URL | optional |
| Copyright | `2026 Salvia Code Labs` |
| Age rating | answer the questionnaire honestly: the app has **in-app chat between players**, with mute, report and block, and **no** gambling, violence or web access |
| App Review notes | say that tapping "Play against bots without an account" needs no sign-in, that friend tables need Sign in with Apple, and that the three in-app purchases are optional contributions that unlock nothing |

**In-app purchases ship with the first version.** The three tip-jar consumables each need their own
name, description and review screenshot in App Store Connect, submitted alongside the build. A
first submission without them is the usual reason a tip jar goes live a week late.

## Google Play Console

Per language:

| Field | Limit | File |
|---|---|---|
| App name | 30 | `google-play/title-<loc>.txt` |
| Short description | 80 | `google-play/short-<loc>.txt` |
| Full description | 4000 | `google-play/full-<loc>.txt` |
| Release notes | 500 | `google-play/whats-new-<loc>.txt` |

Play has no keyword field: the title, the short description and the full description are what it
indexes. That is why the Play title carries "Card Game" / "jogo de cartas" and the App Store name
stays clean — Apple has a keyword field, Play does not.

Once:

| Field | Value |
|---|---|
| Category | Games → Card |
| Contact email | the address you want shown publicly on the listing |
| Privacy policy URL | https://salviacodelabs.com/buraco/privacy |
| Ads | **No ads** |
| In-app purchases | Yes — three consumables (the tip jar) |
| Data safety | collected: email and name (sign-in), push token (turn notifications), purchase history. Encrypted in transit. Not shared, not used for tracking or ads |
| Account deletion | in-app at Settings → Delete account. Play also wants a **web URL** where someone can ask for deletion without installing the app |
| Content rating | IARC questionnaire: declare player-to-player chat. Expect the "Users Interact" label |
| Target audience | choose the age bands deliberately — including under-13 puts the app under the Families policy, which the chat would then have to satisfy |

## Still needed from you

1. **Support URL** for App Store Connect, and a **public contact email** for Play.
2. **Account-deletion web page** for Play's data safety form.
3. **The three in-app purchase entries** in App Store Connect, submitted with the build.
4. Whether the App Store name should also carry a keyword (`Buraco Lounge: Card Game`) or stay
   clean. Play already carries one.

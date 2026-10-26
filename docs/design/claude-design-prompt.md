# Prompt for Claude Design — Buraco app

Copy everything below the line into Claude Design.

---

Design the full mobile UI for a **Brazilian buraco (canastra) card game app** for iPhone and Android, and its design system. The working name is "Buraco" (a placeholder, so keep the wordmark easy to swap).

## Who it is for and what it must feel like

- A small group of friends who play buraco together, often in different countries. The app exists so they can play together. Nobody is trying to make money from it.
- **Free, no ads, no store, no coins, no rankings, no VIP badges.** Leave out anything that looks like monetisation or engagement bait.
- **Calm and minimal. The game is the focus.** Think of a quiet evening at a card table rather than a casino. Avoid confetti, popups, flashing rewards and loud gradients.
- Feedback is soft: cards slide gently, the active seat glows subtly, and illegal moves are explained in plain words instead of shaking red errors.
- Portuguese (Brazil) first. Write all UI copy in **pt-BR**, and keep labels short enough to fit in English and Danish later (allow about 30% longer strings).

## Visual direction

- Muted, warm palette. The table surface is either **deep felt green** or **deep blue-grey**. Show both as options and recommend one. Cards are **off-white**, never pure white. Use **one** accent colour for interactive and "your turn" states.
- Semantic colours (separate from the accent): valid move, invalid move, and team A versus team B in 2v2. The two team colours must stay distinguishable with colour-blindness.
- **Light and dark mode.** The table stays dark-ish in both. Light mode mainly changes the menus, sheets and settings.
- Generous spacing and large touch targets (at least 44pt).
- **Cards must be very readable**: large rank and suit index in the corner and high contrast. Offer an optional **four-colour deck** setting (spades black, hearts red, diamonds blue, clubs green). Jokers and 2s are wild cards and need a subtle, consistent marker so players spot them instantly.
- Typography: one friendly, highly legible sans for UI and numbers (tabular figures for scores), plus optionally one display face for the wordmark only.
- Motion: a short, eased card movement from the deck to the hand and from the hand to the discard pile or a meld. Every animation needs a reduce-motion alternative (a crossfade or an instant change).

## Platform constraints (design within these)

- React Native + Expo, one codebase for iOS and Android.
- **Both orientations, chosen by the player.** Settings offers Automatic (follow the device), Portrait and Landscape. Every screen must work in both, and the **game table needs a real layout for each orientation**, not a stretched copy.
- **Tablet-friendly.** iPad and Android tablets get proper layouts that use the extra space (for example both teams' melds fully visible and chat docked to the side in landscape), not a phone column centred on a big screen.
- Respect safe areas (notch, home indicator) and the Android edge-to-edge system bars.
- Standard platform sheets and modals are preferred over custom chrome.
- First version: tap to select, then tap a target (meld area or discard pile). Drag-and-drop comes later, so the tap flow must work fully on its own.

## The game, briefly (so the table layout makes sense)

- 108 cards (two decks plus jokers). 2 players, or 4 players in two teams of 2 (partners sit opposite).
- Each player holds **11 cards**. The hand can grow to **25+ cards** after taking the whole discard pile. **Design for an 11-card hand and a 25-card hand.**
- Two **mortos** (11-card reserve piles) sit face down on the table. Each team takes one when a player empties their hand the first time. Show whether each team has already taken its morto.
- A turn is: **draw** (from the stock, or take the **whole** discard pile) → optionally **meld** (lay down or extend sequences of 3+ cards of the same suit; wilds can substitute) → **discard** one card.
- Melds belong to the team, not the player, and lie face up in front of the team.
- A meld of 7+ cards is a **canastra**: **limpa** (clean, no wild) or **suja** (dirty, with a wild). Canastras must be clearly distinguishable from ordinary melds, and limpa from suja (for example a subtle frame or a small label, not a big badge).
- Three rule modes: **Aberto**, **Fechado** and **STBL** (Sem Trinca, Bate Limpo). The active mode is visible but quiet on the table.
- Scores are kept per team across rounds up to a target score.

## Screens to design

1. **Home**: new table, join with a code, a list of ongoing games ("your turn" first), practice against bots. Include the empty state for a first-time user with no games.
2. **Sign in**: wordmark, short tagline, **Continue with Apple** (iOS only), **Continue with Google** (with the official four-colour Google "G"; do not recolour it), and a quieter **"Jogar contra bots sem conta"** option. There is no email or password sign-in. The button order and styling follow Apple's and Google's branding rules. One calm screen, no carousel. Also design the moment when a guest tries to play with friends and is asked to sign in.
3. **New table setup**: rule mode (Aberto / Fechado / STBL, each with a one-line explanation; only Aberto is available at launch, so show the others as "em breve"), 2 or 4 players, **live or async** ("Ao vivo" means everyone plays now; "No seu tempo" means each player takes their turn whenever and gets notified), target score, seat assignment (friend invite or bot with level **relaxed / standard / sharp**), and a chat on/off toggle. Private by default. End with a **share invite** step that shows a short table code and a share link.
4. **Lobby / waiting room**: seats filling up, who is connected, and the bots in empty seats. The host can start the game.
5. **Game table (the main screen; give it the most care)**, in these states:
   - 2-player and 4-player (2v2) layouts.
   - My turn before drawing, my turn after drawing (meld/discard), and the opponent's turn (waiting).
   - A card selected, several cards selected forming a valid meld, and an invalid selection with a short plain-language reason.
   - Taking the discard pile (the pile must show its size and its top card, and taking it is a deliberate action).
   - A team that has taken its morto, a team with one or more canastras, and the "can go out" state (bater).
   - A player disconnected with a bot temporarily holding their seat ("Bot jogando por Ana").
   - The hand at 11 cards and at 25 cards (overlapping fan or two rows; propose a solution), with an **auto-sort toggle** (by suit / by rank).
   - What must always be visible: my hand, both teams' melds, the stock with its remaining count, the discard pile, the morto status per team, whose turn it is, the team scores, and an unread chat dot.
6. **Chat**: a slide-up panel over the table with short text plus a row of quick phrases and emoji ("Boa!", "Vai logo 😅", "Bem jogado"). It shows the unread dot when collapsed. Per-player mute, **report** and **block** must be reachable from a player's name, because the app stores require them for chat. Also design the state when the table host has turned chat off.
7. **Round summary**: a calm breakdown per team (cards on the table, canastras limpa/suja, bater bonus, morto penalty, cards left in hand) and the running total against the target. One clear button to start the next round. No fireworks.
8. **Game over**: the winning team and final scores, plus a "play again with the same people" option.
9. **Practice mode extras**: an optional "Por que não posso?" (why was that illegal?) explanation sheet, and an optional hint.
10. **Settings**: card style (standard / four-colour deck), felt colour, **orientation (Automática / Retrato / Paisagem)**, hand sorting, sound, haptics, reduce motion, language, light/dark/system, account (sign out, **delete account**, which is required by the App Store), and links to privacy and terms.
11. **Apoie o app (tip jar)**: reached only from Settings.
    - Short, honest copy: the app is free and has no ads; contributions help pay for the servers that keep the tables running; they are optional and unlock nothing. Example: "O Buraco é gratuito e sem anúncios. As contribuições ajudam a pagar os servidores que mantêm as mesas funcionando. São opcionais e não desbloqueiam nada."
    - Nothing personal: no "buy me a coffee", and never the word "doação". Say "contribuição" or "apoio".
    - Three **equally weighted** buttons ("Apoio pequeno", "Apoio médio", "Apoio grande"), each showing a store price such as "R$ 4,90".
    - States: loading, unavailable (one calm sentence), purchasing, thank-you (one quiet line, no confetti), failed (kind, with "Tentar de novo"), pending ("Aguardando aprovação").
    - It never appears anywhere else, has no badge, and never shows after a game.
12. **System states**: reconnecting, offline, the opponent's turn in an async game ("Vez da Ana — avisamos você"), and push notification permission priming (asked only after the user joins or creates a first table, never at launch).

## Deliverables

1. **Design tokens** for light and dark: colours (named by role, e.g. `table`, `card`, `ink`, `inkSoft`, `accent`, `teamA`, `teamB`, `valid`, `invalid`), type scale, spacing scale, radii and elevation. Format them as tokens I can paste into a React Native theme object.
2. **Card designs**: a face card, a number card, an ace, a 2 (wild), a joker, the card back, and the selected and disabled card states, in both the standard and the four-colour deck.
3. **Components**: card, hand, meld row, canastra marker (limpa/suja), stock, discard pile, morto indicator, seat/avatar with turn and connection state, score chip, chat bubble, quick-phrase row, primary/secondary buttons, sheet, toggle and segmented control.
4. **All screens above** at iPhone size (390×844) in portrait, using realistic pt-BR copy and realistic game states. No lorem ipsum. Show light and dark where it matters.
   - The **game table, chat and round summary** also in iPhone landscape (844×390), iPad portrait (820×1180) and iPad landscape (1180×820).
   - Home and table setup on iPad landscape.
5. A short note on the motion specs (durations and easing) for draw, discard, meld, taking the pile, and the turn change.

Keep everything quiet, legible and focused on the cards.

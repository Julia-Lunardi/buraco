# Rules spec: Aberto

Status: **draft, awaiting Julia's approval**. This file is the source of truth for the rules engine. Each rule has an id (`R-…`) that the engine tests reference.

Where a rule was an educated guess rather than something you confirmed, it is marked **[assumed]**. The engine reads every one of these as a preset flag (section 9), so changing one later is a config edit plus its tests, not a rewrite.

---

## 1. Players and seating

- **R-SEAT-1** 2 players (each for themselves) or 4 players in 2 teams of 2. In 4-player games, partners sit opposite each other.
- **R-SEAT-2** Play goes **counter-clockwise** (the Brazilian convention). **[assumed]**
- **R-SEAT-3** The deal rotates counter-clockwise each round. The player to the dealer's right starts.
- In this document, "team" also means a single player in a 2-player game.

## 2. Cards

- **R-CARD-1** Two standard 52-card decks plus 4 jokers: **108 cards**.
- **R-CARD-2** **Wild cards** (*curingas*) are jokers and all 2s.
- **R-CARD-3** A 2 played in its natural position in a sequence of its own suit (for example ♥A-2-3) counts as a natural card, not a wild.
- **R-CARD-4** The engine checks after every action that hands + stock + discard pile + mortos + melds always add up to exactly 108 cards.

## 3. Deal

- **R-DEAL-1** Each player gets **11 cards**.
- **R-DEAL-2** Two **mortos** of 11 cards each are set aside face down.
  - In a 4-player game there is one morto per team.
  - In a 2-player game there is one morto per player.
- **R-DEAL-3** One card is turned face up to start the discard pile (*lixo*). The rest form the stock (*monte*).
- **R-DEAL-4** The shuffle takes a seed, so the same seed always produces the same game.

## 4. Turn

A turn has three steps, always in this order: **draw → meld (optional) → discard**.

### 4.1 Draw (choose one)
- **R-DRAW-1** Take the top card of the stock.
- **R-DRAW-2** Take the **whole discard pile**. **Aberto means no condition applies**: you may take the pile at any time, whatever its size, without having to use the top card. *(This is the difference from Fechado.)*

### 4.2 Meld
- **R-MELD-1** A player may lay down new melds and add cards to **any of their own team's melds**, in any number, during their turn.
- **R-MELD-2** **Sequence**: 3 or more cards of the same suit in consecutive rank order.
  - The ace counts low (A-2-3) or high (Q-K-A), but a sequence does not wrap around (K-A-2 is not allowed).
  - The longest possible sequence is A-2-…-K-A: 14 cards.
- **R-MELD-3** **Trinca** (a set of 3 or more cards of the same rank, any suits) is **allowed in Aberto**. **[assumed]**
  - 2s and jokers cannot form a trinca by themselves.
  - In STBL this flag is off.
- **R-MELD-4** **A meld may contain at most 1 wild card.** **[assumed]** A 2 sitting in its natural position does not count (see R-CARD-3).
- **R-MELD-5** A wild card that has been laid down cannot be taken back or replaced. **[assumed]**
- **R-MELD-6** A player may not meld down to zero cards in hand unless the move takes their team's morto (R-MORTO-1) or makes them go out (R-OUT-1). In every other case they must keep at least one card to discard.

### 4.3 Discard
- **R-DISC-1** The turn ends when the player puts one card on the discard pile.

## 5. Canastras

- **R-CAN-1** A meld of **7 or more cards** is a canastra.
- **R-CAN-2** **Limpa** (clean) has no wild card. **Suja** (dirty) has one wild card.
- **R-CAN-3** A canastra may keep growing after 7 cards. A limpa canastra becomes suja if a wild is added.
- **R-CAN-4** A clean A-to-A sequence (14 cards) is a **canastra real** and earns a bonus. **[assumed]**

## 6. Morto

- **R-MORTO-1** The first time a player on a team empties their hand, that team takes its morto.
  - **Emptied by melding** (*morto direto*): the player picks up the morto immediately and keeps playing the same turn.
  - **Emptied by discarding** (*morto indireto*): the player picks up the morto, and it becomes their hand from their next turn on.
- **R-MORTO-2** Each team takes at most one morto.
- **R-MORTO-3** If the stock runs out and a morto is still on the table, the untaken morto becomes the new stock. **[assumed]**
  - *Clarified while building the engine:* the check happens after each discard. If both mortos are waiting, the one belonging to the next player's team is used first.
  - A team whose morto became stock never took it, so it still gets the −100 penalty. Its going-out condition becomes "no morto waiting" plus a canastra.

## 7. Going out (*bater*) and end of round

- **R-OUT-1** A player may go out only if **both** are true:
  - their team has no morto waiting (it was taken, or became stock under R-MORTO-3), and
  - their team has **at least one canastra**, limpa or suja. *(In STBL it must be limpa.)*
- **R-OUT-2** A player goes out by discarding their last card, or by melding their last cards so no discard is needed. **[assumed]**
- **R-OUT-3** The round also ends, with no bater bonus, when a discard leaves the stock empty and no morto is left to become the new stock. *(Clarified while building the engine: the round ends at that discard, rather than letting players keep taking the discard pile back and forth.)*
- **R-OUT-4** A player cannot take the discard pile when doing so would leave them without a legal way to continue. In practice this is never blocked, because a player can always discard.

## 8. Scoring

### 8.1 Card values
| Card | Points |
|---|---|
| Joker | 20 |
| 2 | 10 |
| A | 15 |
| K, Q, J, 10, 9, 8 | 10 |
| 7, 6, 5, 4, 3 | 5 |

**[assumed]** Jokers and 2s keep their wild value even when a 2 sits in its natural position.

### 8.2 Round score per team
| Item | Points |
|---|---|
| Cards in the team's melds | + card values |
| Each canastra suja | +100 |
| Each canastra limpa | +200 |
| Each canastra real (clean A-to-A) | +500 instead of +200 |
| Going out (bater) | +100 |
| Cards left in hand | − card values (in 4-player games, both partners' hands) |
| Morto never taken | −100 |

### 8.3 Match
- **R-SCORE-1** Rounds are played until a team reaches **3000 points**. **[assumed]**
- **R-SCORE-2** If both teams pass 3000 in the same round, the higher score wins. If the scores are exactly equal, another round is played.

## 9. Preset flags (Aberto values)

| Flag | Aberto | Fechado (later) | STBL (later) |
|---|---|---|---|
| `trincas_allowed` | true | true | **false** |
| `discard_pickup` | `free` | `must_use_top_card` | `free` |
| `go_out_requires` | `any_canastra` | `any_canastra` | **`clean_canastra`** |
| `max_wilds_per_meld` | 1 | 1 | 1 |
| `canastra_extendable` | true | true | true |
| `untaken_morto_becomes_stock` | true | true | true |
| `go_out_by_meld_allowed` | true | true | true |
| `card_values` | §8.1 | §8.1 | §8.1 |
| `bonus_suja / limpa / real / bater` | 100 / 200 / 500 / 100 | same | same |
| `morto_not_taken_penalty` | −100 | −100 | −100 |
| `target_score` | 3000 | 3000 | 3000 |

## 10. Play modes (not rules, but they affect the engine interface)

- **Live**: everyone is at the table. A turn timer is optional, and a bot takes over a disconnected seat.
- **Async**: no turn timer. The player whose turn it is gets a push notification. Game state is saved after every action.
- The host chooses live or async when creating the table. Bots act immediately in both modes.

## 11. Questions for you (answer whenever; the defaults above stand until then)

1. Trincas in Aberto (R-MELD-3): allowed, or only in some variants you play?
2. At most one wild per meld (R-MELD-4)?
3. Joker worth 20 or 50?
4. Target score 3000, or something shorter for quick games (for example 1500 as a table option)?

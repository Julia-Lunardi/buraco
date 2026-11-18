# Rules spec: Fechado

Status: **draft, for Julia's review** (educated decisions, as asked on 26.10.2026).
Fechado is **Aberto with one change**: the discard pile is "closed" (*lixo fechado*).
Everything else is exactly [aberto.md](aberto.md).

## The difference

- **R-PILE-F** You may take the discard pile only if you **use its top card at once**:
  - in a **new meld** with at least two cards from your hand (all three or more valid under the usual meld rules, R-MELD-2 to R-MELD-4), or
  - **added to one of your team's melds**, optionally together with more cards from your hand.

  The rest of the pile joins your hand. Then the turn goes on as usual: meld more, then discard.
- If the top card can't be used, you draw from the stock.
- The usual hand rule (R-MELD-6) applies to the pickup meld too.

Engine flag (§9 of aberto.md): `discard_pickup = must_use_top_card`. All other flags have the Aberto values (trincas allowed, any canastra goes out).

## Assumed

- **[assumed]** The top card may complete a meld that uses a wild from your hand, within the
  one-wild limit. A wild *on top* of the pile may be used like any card. In practice bots
  never take a pile for a wild, and players rarely can.
- **[assumed]** No minimum pile size, and no ban on taking a pile of one card.

## In the app

The pile (*a mesa*) is squared up: only its top card shows, with the count. On your turn to draw, select the cards in your hand that make a meld with the top card and tap the top card, in either order. It lifts like a selected card. When the meld is valid, a **Baixar jogo e pegar a mesa** button appears. Tapping it lays the meld down and puts the rest of the pile in your hand. To add the top card to one of your melds instead, tap that meld. Nothing moves unless the meld is valid.

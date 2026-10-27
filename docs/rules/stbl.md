# Rules spec: STBL (Sem Trinca, Bate Limpo)

Status: **draft, for Julia's review.** Julia asked for educated decisions on house rules
(26.10.2026). STBL is defined as **Aberto with two changes**, the two the mode's name states.
Everything not listed here is exactly [aberto.md](aberto.md), including its rule ids.

## Differences from Aberto

| Rule | Aberto | STBL |
|---|---|---|
| R-MELD-3 Trincas (sets of the same rank) | allowed | **not allowed** ("Sem Trinca"). Only sequences of one suit. |
| R-OUT-1 Going out | needs any canastra | **needs a clean canastra** ("Bate Limpo"): limpa or real. A canastra suja still scores, but doesn't let your team go out. |

Engine flags (§9 of aberto.md): `trincas_allowed = false`, `go_out_requires = clean_canastra`.
All other flags have the Aberto values.

## Consequences

- R-MELD-6 (never leave a hand that can't finish the turn) uses the stricter condition. With
  only dirty canastras, a player must keep a card to discard after the team took its morto.
- Rounds run longer, and more of them end by the stock running out (R-OUT-3).

## Bot strategy (the handover: bots must understand STBL)

- **Wilds only after a clean canastra:** a wild that completes a canastra makes it suja, which can't be used to go out. STBL bots spend a wild only once their team already has a clean canastra.
- **Denying the pile matters as much as in Aberto:** the sharp level never discards a card that extends an opponent's meld.

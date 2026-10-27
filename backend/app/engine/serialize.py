"""Actions as plain dicts, for the move log and the wire."""

from __future__ import annotations

from .game import Action, AddToMeld, Discard, Draw, LayDown, TakeDiscard


def action_to_dict(action: Action) -> dict:
    match action:
        case Draw():
            return {"type": "draw"}
        case TakeDiscard(use_with=use_with, meld_id=meld_id):
            out: dict = {"type": "take_discard"}
            if use_with:
                out["use_with"] = list(use_with)
            if meld_id is not None:
                out["meld"] = meld_id
            return out
        case LayDown(card_ids=ids):
            return {"type": "lay_down", "cards": list(ids)}
        case AddToMeld(meld_id=meld, card_ids=ids):
            return {"type": "add_to_meld", "meld": meld, "cards": list(ids)}
        case Discard(card_id=card):
            return {"type": "discard", "card": card}
    raise TypeError(f"unknown action {action!r}")


def action_from_dict(data: dict) -> Action:
    """Raises ValueError for anything malformed; legality is the engine's job."""
    try:
        kind = data["type"]
        if kind == "draw":
            return Draw()
        if kind == "take_discard":
            meld = data.get("meld")
            return TakeDiscard(tuple(_ids(data.get("use_with", []))), None if meld is None else _int(meld))
        if kind == "lay_down":
            return LayDown(tuple(_ids(data["cards"])))
        if kind == "add_to_meld":
            return AddToMeld(_int(data["meld"]), tuple(_ids(data["cards"])))
        if kind == "discard":
            return Discard(_int(data["card"]))
    except (KeyError, TypeError) as exc:
        raise ValueError(f"malformed action: {data!r}") from exc
    raise ValueError(f"unknown action type: {data.get('type')!r}")


def _int(value) -> int:
    if not isinstance(value, int) or isinstance(value, bool):
        raise ValueError(f"expected an integer, got {value!r}")
    return value


def _ids(values) -> list[int]:
    if not isinstance(values, list) or len(values) > 30:
        raise ValueError("cards must be a list of card ids")
    return [_int(v) for v in values]

import pytest

from app.engine.melds import CanastraKind, MeldKind, analyse, canastra_kind
from app.engine.presets import ABERTO, Preset

from .helpers import cards

NO_TRINCAS = Preset(**{**ABERTO.__dict__, "name": "no-trincas", "trincas_allowed": False})


def shape(codes: str, preset: Preset = ABERTO, kind: MeldKind | None = None):
    return analyse(cards(codes), preset, kind)


# --- sequences (R-MELD-2) ---------------------------------------------------

@pytest.mark.parametrize("codes", ["3H 4H 5H", "5H 3H 4H", "9S 10S JS QS KS", "QD KD AD", "AC 2C 3C"])
def test_valid_clean_sequences(codes):
    s = shape(codes)
    assert s.kind is MeldKind.SEQUENCE and s.wilds == 0


@pytest.mark.parametrize("codes", ["3H 4H", "3H 4H 6H", "3H 4S 5H", "KH AH 3H", "5H 5H 6H"])
def test_invalid_sequences(codes):
    assert shape(codes) is None


def test_ace_does_not_wrap_around():
    # K-A-2 is only valid when the 2 acts as a wild Q (Q-K-A), never as a wrap.
    s = shape("KH AH 2H")
    assert s.wilds == 1 and (s.low, s.high) == (12, 14)


def test_full_run_ace_to_ace_is_fourteen_cards():
    s = shape("AH 2H 3H 4H 5H 6H 7H 8H 9H 10H JH QH KH AH")
    assert s.wilds == 0 and (s.low, s.high) == (1, 14)


def test_fifteen_cards_never_fit():
    assert shape("AH 2H 3H 4H 5H 6H 7H 8H 9H 10H JH QH KH AH JK") is None


# --- wilds (R-CARD-2, R-CARD-3, R-MELD-4) -----------------------------------

def test_joker_fills_a_gap():
    s = shape("3H JK 5H")
    assert s.kind is MeldKind.SEQUENCE and s.wilds == 1


def test_two_of_another_suit_is_wild():
    assert shape("3H 2S 5H").wilds == 1


def test_two_in_its_natural_place_is_not_wild():
    assert shape("AH 2H 3H").wilds == 0
    assert shape("2H 3H 4H").wilds == 0


def test_at_most_one_wild_per_meld():
    assert shape("3H JK 2S 6H") is None
    assert shape("3H JK JK") is None


def test_natural_two_plus_one_wild_is_allowed():
    s = shape("2H 3H JK 5H")
    assert s.wilds == 1


def test_only_wilds_is_not_a_meld():
    assert shape("JK 2S 2D") is None


# --- trincas (R-MELD-3) -----------------------------------------------------

def test_trinca_allowed_in_aberto():
    s = shape("7H 7S 7D")
    assert s.kind is MeldKind.TRINCA and s.rank == 7 and s.wilds == 0


def test_trinca_with_one_wild():
    assert shape("KH KS JK").wilds == 1


def test_trinca_of_twos_is_not_allowed():
    assert shape("2H 2S 2D") is None


def test_trincas_off_by_flag():
    assert shape("7H 7S 7D", NO_TRINCAS) is None


def test_kind_is_kept_when_extending():
    assert shape("7H 7S 7D 8H", kind=MeldKind.TRINCA) is None
    assert shape("7H 8H 9H 7S", kind=MeldKind.SEQUENCE) is None


# --- canastras (R-CAN-*) ----------------------------------------------------

def _kind(codes: str):
    c = cards(codes)
    return canastra_kind(len(c), analyse(c, ABERTO), ABERTO)


def test_six_cards_is_not_a_canastra():
    assert _kind("3H 4H 5H 6H 7H 8H") is None


def test_clean_canastra():
    assert _kind("3H 4H 5H 6H 7H 8H 9H") is CanastraKind.LIMPA


def test_dirty_canastra():
    assert _kind("3H 4H 5H JK 7H 8H 9H") is CanastraKind.SUJA


def test_natural_two_keeps_canastra_clean():
    assert _kind("AH 2H 3H 4H 5H 6H 7H") is CanastraKind.LIMPA


def test_trinca_canastra():
    assert _kind("9H 9S 9D 9C 9H 9S 9D") is CanastraKind.LIMPA


def test_canastra_real_is_clean_ace_to_ace():
    assert _kind("AH 2H 3H 4H 5H 6H 7H 8H 9H 10H JH QH KH AH") is CanastraKind.REAL


def test_stbl_preset_has_no_trincas():
    from app.engine.presets import STBL
    assert shape("7H 7S 7D", STBL) is None
    assert shape("7H 8H 9H", STBL) is not None

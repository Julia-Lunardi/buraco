"""A basic word filter for table chat (App Store Guideline 1.2 asks for "a method for
filtering objectionable material"). Masks whole words, ignoring case and accents.
It is a floor, not moderation: reports and blocks do the rest.

The list holds strong profanity and slurs in pt-BR, English and Danish. Add words
here as reports come in. Keep it unambiguous: a word with an everyday meaning
(e.g. "macaco", "bicha", "mongol") stays out, or normal table talk gets mangled.
"""

import re
import unicodedata

_WORDS = """
porra caralho merda puta puto putaria foda foder fodase fodido buceta boceta cu arrombado
arrombada desgracado desgracada vagabunda vagabundo corno viado viadinho
sapatao retardado cacete otario otaria babaca escroto escrota filhodaputa fdp vsf tnc
fuck fucking fucker motherfucker shit bullshit bitch cunt asshole bastard slut whore
fag faggot nigger nigga retard twat wanker
kraftedeme kraftidme fanden satans luder kaelling boesseroev bosserov perker fisse pik
"""

_BLOCKED = frozenset(_WORDS.split())
_WORD = re.compile(r"\w+", re.UNICODE)


def _plain(word: str) -> str:
    folded = unicodedata.normalize("NFKD", word.casefold())
    return "".join(c for c in folded if not unicodedata.combining(c)).replace("ø", "o").replace("æ", "ae")


def clean(text: str) -> str:
    return _WORD.sub(lambda m: "*" * len(m.group()) if _plain(m.group()) in _BLOCKED else m.group(), text)

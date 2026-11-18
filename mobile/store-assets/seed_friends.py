"""Give the app's account a believable life with friends, for store screenshots.

Sign in as a guest in the app (pointed at the local backend), then run this from backend/.
It takes the newest *guest* user (the one the app just created), names it and promotes it to
a full account (what a Google sign-in produces), creates test friends, and plays real games
with them through the backend's own services, every seat moved by the engine's bot:

  - a 2-player Aberto game with a friend, in round 2 with points on the board, your turn,
    melds down and a few chat messages with reactions;
  - a 4-player Fechado game, you and a partner against two friends, their turn;
  - a 2-player STBL game with a friend, your turn, early on;
  - an Aberto game with a friend on "Bater só com canastra limpa", round 3, their turn;
  - a 4-player lobby with a friend already sitting and one seat still open.

All games are "No seu tempo" (async), so nothing moves on its own while you capture.

  uv run python ../mobile/store-assets/seed_friends.py                 # pt-BR names and chat
  uv run python ../mobile/store-assets/seed_friends.py --locale en --me Emma
  uv run python ../mobile/store-assets/seed_friends.py --locale da --me Freja

Run it again after signing in as a new guest for another locale: it never touches older accounts.
"""
from __future__ import annotations

import argparse
import asyncio
import sys
import uuid

sys.path.insert(0, ".")
from sqlalchemy import select  # noqa: E402

from app.db.session import SessionLocal  # noqa: E402
from app.engine.bots import BOTS  # noqa: E402
from app.engine.serialize import action_to_dict  # noqa: E402
from app.models import GameTable, PlayMode, TableStatus, User  # noqa: E402
from app.services import chat, tables  # noqa: E402

LOCALES = {
    "pt-BR": {
        "me": "Julia",
        "friends": ["Marina", "Rafa", "Bia", "Caio"],
        "chat": [("friend", "Boa sorte! 🍀"), ("me", "Hoje a mesa é minha 😄"), ("friend", "Veremos… 😏"),
                 ("me", "Bem jogado!")],
        "team_chat": [("partner", "Segura o morto pra gente!"), ("me", "Deixa comigo 💪")],
    },
    "en": {
        "me": "Emma",
        "friends": ["Sam", "Olivia", "Ben", "Chloe"],
        "chat": [("friend", "Good luck! 🍀"), ("me", "Tonight the table is mine 😄"), ("friend", "We'll see… 😏"),
                 ("me", "Nice play!")],
        "team_chat": [("partner", "Hold on to that morto for us!"), ("me", "Leave it to me 💪")],
    },
    "da": {
        "me": "Freja",
        "friends": ["Mads", "Ida", "Emil", "Sofie"],
        "chat": [("friend", "Held og lykke! 🍀"), ("me", "I aften er bordet mit 😄"), ("friend", "Det får vi at se… 😏"),
                 ("me", "Flot spillet!")],
        "team_chat": [("partner", "Hold på mortoen for os!"), ("me", "Det klarer jeg 💪")],
    },
}


async def make_friend(db, name: str) -> User:
    user = User(display_name=name, is_guest=False)
    db.add(user)
    await db.flush()
    return user


async def play(db, table: GameTable, people: dict[uuid.UUID, User], stop, max_moves: int = 600) -> GameTable:
    """Move every person's seat with the standard bot (the real bots play their own seats inside
    `act`), dealing new rounds as they come, until `stop(table, match)` says this is the moment."""
    for _ in range(max_moves):
        table = await tables.refreshed(db, table)
        match = await tables.load_match(db, table)
        if stop(table, match):
            return table
        if table.status is TableStatus.ROUND_OVER:
            host = people[table.host_id]
            table, _ = await tables.next_round(db, host, table.id)
            continue
        if table.status is not TableStatus.PLAYING:
            raise SystemExit(f"table {table.code} ended ({table.status.value}) before reaching its moment")
        seat = match.round.current
        user = people[table.seats[seat].user_id]
        action = BOTS["standard"].choose(match.round, seat)
        await tables.act(db, user, table.id, action_to_dict(action))
    raise SystemExit(f"table {table.code} never reached its moment in {max_moves} moves")


def seat_of(table: GameTable, user: User) -> int:
    return next(s.seat for s in table.seats if s.user_id == user.id)


def my_turn_with_melds(me: User, round_no: int, min_discard: int = 2):
    def stop(table: GameTable, match) -> bool:
        rnd = match.round
        if table.status is not TableStatus.PLAYING or rnd is None or len(match.history) < round_no - 1:
            return False
        mine = seat_of(table, me)
        return (rnd.current == mine and rnd.phase.value == "draw" and len(rnd.discard) >= min_discard
                and len(rnd.teams[mine % 2].melds) >= 2 and len(rnd.teams[1 - mine % 2].melds) >= 1)
    return stop


def their_turn(me: User, round_no: int, min_turns: int):
    def stop(table: GameTable, match) -> bool:
        rnd = match.round
        if table.status is not TableStatus.PLAYING or rnd is None or len(match.history) < round_no - 1:
            return False
        mine = seat_of(table, me)
        return rnd.current % 2 != mine % 2 and rnd.turns >= min_turns and len(rnd.teams[mine % 2].melds) >= 1
    return stop


async def say(db, table: GameTable, lines, who: dict[str, User]) -> list:
    sent = []
    for speaker, text in lines:
        sent.append(await chat.post(db, who[speaker], table.id, text))
    return sent


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--locale", choices=LOCALES, default="pt-BR")
    parser.add_argument("--me", help="your display name (default: the locale's)")
    args = parser.parse_args()
    loc = LOCALES[args.locale]

    async with SessionLocal() as db:
        me = (await db.execute(select(User).where(User.is_guest.is_(True))
                               .order_by(User.created_at.desc()).limit(1))).scalar_one_or_none()
        if me is None:
            raise SystemExit("no guest account yet: open the app on the local backend and tap 'Jogar como convidado' first")
        me.is_guest = False
        me.display_name = args.me or loc["me"]
        a, b, c, d = [await make_friend(db, name) for name in loc["friends"]]
        people = {u.id: u for u in (me, a, b, c, d)}
        await db.commit()
        print(f"you: {me.display_name} ({me.id}); friends: {', '.join(u.display_name for u in (a, b, c, d))}")

        async def friends_table(friends: list[User], **kw) -> GameTable:
            table = await tables.create_table(db, me, mode=PlayMode.ASYNC, **kw)
            for f in friends:
                await tables.join(db, f, table.code)
            await tables.start(db, me, table.id)
            await db.commit()
            return table

        # 1. Aberto with a friend: round 2, your turn, melds on both sides, a chat with reactions.
        t1 = await friends_table([a], num_players=2, seats=["friend"], preset="aberto", target_score=3000)
        t1 = await play(db, t1, people, my_turn_with_melds(me, round_no=2))
        msgs = await say(db, t1, loc["chat"], {"me": me, "friend": a})
        await chat.react(db, a, t1.id, msgs[1].id, "😂")
        await chat.react(db, me, t1.id, msgs[2].id, "😮")
        await chat.react(db, a, t1.id, msgs[3].id, "❤️")
        await db.commit()
        print(f"1  Aberto with {a.display_name}: round 2, your turn          code {t1.code}  scores {(await tables.load_match(db, t1)).scores}")

        # 2. Fechado, 4 players: you and a partner (seat 2) against two friends; their turn.
        t2 = await friends_table([b, c, d], num_players=4, seats=["friend", "friend", "friend"], preset="fechado",
                                 target_score=3000)
        t2 = await play(db, t2, people, their_turn(me, round_no=1, min_turns=14))
        partner = people[t2.seats[(seat_of(t2, me) + 2) % 4].user_id]
        await say(db, t2, loc["team_chat"], {"me": me, "partner": partner})
        await db.commit()
        print(f"2  Fechado, you + {partner.display_name}: their turn            code {t2.code}")

        # 3. STBL with a friend: early, your turn.
        t3 = await friends_table([c], num_players=2, seats=["friend"], preset="stbl", target_score=2000)
        t3 = await play(db, t3, people, my_turn_with_melds(me, round_no=1))
        await db.commit()
        print(f"3  STBL with {c.display_name}: your turn                    code {t3.code}")

        # 4. Aberto, clean canastra to go out: round 3, their turn.
        t4 = await friends_table([d], num_players=2, seats=["friend"], preset="aberto", target_score=5000,
                                 clean_to_go_out=True)
        t4 = await play(db, t4, people, their_turn(me, round_no=3, min_turns=10))
        await db.commit()
        print(f"4  Aberto (limpa) with {d.display_name}: round 3, their turn  code {t4.code}")

        # 5. A lobby: one friend sitting, one seat open, one bot.
        t5 = await tables.create_table(db, me, num_players=4, seats=["friend", "friend", "bot"], preset="aberto")
        await tables.join(db, a, t5.code)
        await db.commit()
        print(f"5  Lobby with {a.display_name}, one seat open                code {t5.code}")


if __name__ == "__main__":
    asyncio.run(main())

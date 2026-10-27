"""Step 16: tables and games persist after every action; live or async per table."""

import pytest
from sqlalchemy import func, select

from app.engine.bots import GreedyBot
from app.engine.game import Phase
from app.engine.serialize import action_from_dict, action_to_dict
from app.engine.game import AddToMeld, Discard, Draw, LayDown, TakeDiscard
from app.models import GameAction, GameTable, PlayMode, TableStatus, User
from app.services import tables
from app.services.tables import TableError


async def make_user(db, name="Ana", guest=False) -> User:
    user = User(display_name=name, is_guest=guest)
    db.add(user)
    await db.flush()
    return user


async def human_turn(db, table: GameTable, user: User):
    """Play one action for `user` with the baseline bot's brain."""
    match = await tables.load_match(db, table)
    seat = next(s.seat for s in table.seats if s.user_id == user.id)
    action = GreedyBot().choose(match.round, seat)
    return await tables.act(db, user, table.id, action_to_dict(action))


# --- serialisation ---------------------------------------------------------------

@pytest.mark.parametrize("action", [Draw(), TakeDiscard(), LayDown((1, 2, 3)), AddToMeld(4, (5,)), Discard(9)])
def test_actions_round_trip(action):
    assert action_from_dict(action_to_dict(action)) == action


@pytest.mark.parametrize("bad", [{}, {"type": "cheat"}, {"type": "discard"}, {"type": "discard", "card": "9"},
                                 {"type": "lay_down", "cards": "123"}, {"type": "discard", "card": True}])
def test_malformed_actions_are_rejected(bad):
    with pytest.raises(ValueError):
        action_from_dict(bad)


# --- creating and joining ------------------------------------------------------------

async def test_bot_table_starts_at_once_and_waits_for_the_host(sessions):
    async with sessions() as db:
        ana = await make_user(db)
        table = await tables.create_table(db, ana, num_players=4, seats=["bot", "bot", "bot"])
        assert table.status is TableStatus.PLAYING
        assert table.current_seat == 0  # seat 0 starts round 1
        assert len(table.code) == 6 and table.mode is PlayMode.LIVE


async def test_friend_table_waits_in_the_lobby(sessions):
    async with sessions() as db:
        ana = await make_user(db)
        table = await tables.create_table(db, ana, num_players=2, seats=["friend"], mode=PlayMode.ASYNC)
        assert table.status is TableStatus.LOBBY and table.mode is PlayMode.ASYNC


async def test_join_by_code_takes_the_first_open_seat(sessions):
    async with sessions() as db:
        ana, bia, caio = await make_user(db), await make_user(db, "Bia"), await make_user(db, "Caio")
        table = await tables.create_table(db, ana, num_players=4, seats=["friend", "bot", "friend"])
        await tables.join(db, bia, table.code.lower())
        await tables.join(db, caio, table.code)
        await tables.join(db, caio, table.code)  # joining twice is harmless
        assert [s.user_id for s in table.seats] == [ana.id, bia.id, None, caio.id]


async def test_full_table_and_started_table_refuse_joiners(sessions):
    async with sessions() as db:
        ana, bia, caio = await make_user(db), await make_user(db, "Bia"), await make_user(db, "Caio")
        table = await tables.create_table(db, ana, num_players=2, seats=["friend"])
        await tables.join(db, bia, table.code)
        with pytest.raises(TableError) as exc:
            await tables.join(db, caio, table.code)
        assert exc.value.code == "table_full"
        await tables.start(db, ana, table.id)
        with pytest.raises(TableError) as exc:
            await tables.join(db, caio, table.code)
        assert exc.value.code == "already_started"


async def test_guests_play_bots_only(sessions):
    async with sessions() as db:
        guest = await make_user(db, "", guest=True)
        assert (await tables.create_table(db, guest, num_players=2, seats=["bot"])).status is TableStatus.PLAYING
        with pytest.raises(TableError) as exc:
            await tables.create_table(db, guest, num_players=2, seats=["friend"])
        assert exc.value.code == "account_required"


async def test_only_the_host_starts_and_open_seats_become_bots(sessions):
    async with sessions() as db:
        ana, bia = await make_user(db), await make_user(db, "Bia")
        table = await tables.create_table(db, ana, num_players=4, seats=["friend", "friend", "friend"])
        await tables.join(db, bia, table.code)
        with pytest.raises(TableError):
            await tables.start(db, bia, table.id)
        await tables.start(db, ana, table.id)
        assert [s.bot_level for s in table.seats] == [None, None, "standard", "standard"]
        assert table.status is TableStatus.PLAYING


@pytest.mark.parametrize("bad", [{"num_players": 3, "seats": ["bot", "bot"]},
                                 {"num_players": 2, "seats": ["bot", "bot"]},
                                 {"num_players": 2, "seats": ["bot"], "preset": "fechado"},
                                 {"num_players": 2, "seats": ["bot"], "target_score": 1234}])
async def test_invalid_table_settings(sessions, bad):
    async with sessions() as db:
        with pytest.raises(TableError):
            await tables.create_table(db, await make_user(db), **bad)


# --- playing --------------------------------------------------------------------------

async def test_actions_and_bot_replies_are_logged_and_replay_exactly(sessions):
    async with sessions() as db:
        ana = await make_user(db)
        table = await tables.create_table(db, ana, num_players=4, seats=["bot", "bot", "bot"])
        for _ in range(12):
            if table.status is not TableStatus.PLAYING:
                break
            table, live = await human_turn(db, table, ana)
        await db.commit()
        table_id, scores = table.id, list(live.scores)
        views = [live.round.view_for(s) for s in range(4)] if live.round else None

    async with sessions() as db:  # a fresh session: everything comes from the log
        table = await db.get(GameTable, table_id)
        replayed = await tables.load_match(db, table)
        assert replayed.scores == scores
        assert ([replayed.round.view_for(s) for s in range(4)] if replayed.round else None) == views
        logged = (await db.execute(select(func.count()).select_from(GameAction))).scalar_one()
        assert logged > 12 * 2  # each of Ana's actions plus the three bots' replies


async def test_illegal_move_explains_itself(sessions):
    async with sessions() as db:
        ana = await make_user(db)
        table = await tables.create_table(db, ana, num_players=2, seats=["bot"])
        with pytest.raises(TableError) as exc:
            await tables.act(db, ana, table.id, {"type": "discard", "card": 0})
        assert exc.value.http_status == 422 and exc.value.code == "wrong_phase"
        assert "Draw a card" in exc.value.message


async def test_cannot_act_out_of_turn_or_at_someone_elses_table(sessions):
    async with sessions() as db:
        ana, bia, caio = await make_user(db), await make_user(db, "Bia"), await make_user(db, "Caio")
        table = await tables.create_table(db, ana, num_players=2, seats=["friend"])
        await tables.join(db, bia, table.code)
        await tables.start(db, ana, table.id)
        with pytest.raises(TableError) as exc:
            await tables.act(db, bia, table.id, {"type": "draw"})
        assert exc.value.code == "not_your_turn"
        with pytest.raises(TableError) as exc:
            await tables.act(db, caio, table.id, {"type": "draw"})
        assert exc.value.code == "not_seated"


async def test_async_table_waits_for_each_person(sessions):
    async with sessions() as db:
        ana, bia = await make_user(db), await make_user(db, "Bia")
        table = await tables.create_table(db, ana, num_players=2, seats=["friend"], mode=PlayMode.ASYNC)
        await tables.join(db, bia, table.code)
        await tables.start(db, ana, table.id)
        await tables.act(db, ana, table.id, {"type": "draw"})
        match = await tables.load_match(db, table)
        card = match.round.hands[0][0].id
        await tables.act(db, ana, table.id, {"type": "discard", "card": card})
        assert table.current_seat == 1  # nobody plays for Bia: it is simply her turn


async def test_a_whole_match_against_bots_reaches_the_end(sessions):
    async with sessions() as db:
        ana = await make_user(db)
        table = await tables.create_table(db, ana, num_players=2, seats=["bot"], target_score=500)
        for _ in range(3000):
            if table.status is TableStatus.FINISHED:
                break
            if table.status is TableStatus.ROUND_OVER:
                table, _ = await tables.next_round(db, ana, table.id)
            else:
                table, _ = await human_turn(db, table, ana)
        assert table.status is TableStatus.FINISHED and table.current_seat is None
        match = await tables.load_match(db, table)
        assert match.is_over and max(match.scores) >= 500


async def test_deleted_players_seat_is_covered_by_a_bot(sessions):
    async with sessions() as db:
        ana, bia = await make_user(db), await make_user(db, "Bia")
        table = await tables.create_table(db, ana, num_players=2, seats=["friend"])
        await tables.join(db, bia, table.code)
        await tables.start(db, ana, table.id)
        await db.commit()
        await db.delete(bia)
        await db.commit()

    async with sessions() as db:
        table = await db.get(GameTable, table.id)
        await db.refresh(table, ["seats"])
        assert table.seats[1].user_id is None
        await tables.act(db, ana, table.id, {"type": "draw"})
        match = await tables.load_match(db, table)
        await tables.act(db, ana, table.id, {"type": "discard", "card": match.round.hands[0][0].id})
        assert table.current_seat in (0, None)  # the bot played seat 1 and handed back


async def test_seed_never_appears_in_a_player_view(sessions):
    async with sessions() as db:
        ana = await make_user(db)
        table = await tables.create_table(db, ana, num_players=2, seats=["bot"])
        view = (await tables.load_match(db, table)).round.view_for(0)
        assert table.seed not in str(view)


async def test_bot_level_applies_to_bot_seats_and_to_open_seats_at_start(sessions):
    async with sessions() as db:
        ana = await make_user(db)
        table = await tables.create_table(db, ana, num_players=4, seats=["bot", "friend", "friend"], bot_level="sharp")
        assert table.seats[1].bot_level == "sharp"
        await tables.start(db, ana, table.id)
        assert [s.bot_level for s in table.seats] == [None, "sharp", "sharp", "sharp"]
        with pytest.raises(TableError) as exc:
            await tables.create_table(db, ana, num_players=2, seats=["bot"], bot_level="impossible")
        assert exc.value.code == "bad_bot_level"


async def test_stbl_tables_play_with_stbl_rules(sessions):
    async with sessions() as db:
        ana = await make_user(db)
        table = await tables.create_table(db, ana, num_players=2, seats=["bot"], preset="stbl")
        match = await tables.load_match(db, table)
        assert table.preset == "stbl" and match.preset.trincas_allowed is False
        await tables.act(db, ana, table.id, {"type": "draw"})  # plays like any other table

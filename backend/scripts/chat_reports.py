"""Review reported chat messages. Apple expects reports to be acted on promptly
(App Store 1.2), so check this regularly once the app is live.

    uv run python -m scripts.chat_reports                    # open reports
    uv run python -m scripts.chat_reports --hide 123         # hide message 123 for everyone
    uv run python -m scripts.chat_reports --resolve 7        # mark report 7 reviewed
    uv run python -m scripts.chat_reports --delete-user ID   # close an abusive account (terms §3)

Deleting a user removes the account and everything it owns, exactly like "Excluir conta"
in the app (their seats at shared tables pass to bots). Use it for serious or repeated abuse.

In production run it inside the container, which has the database identity:
    az containerapp exec -n ca-buraco-pr -g rg-buraco-pr \\
        --command "uv run --no-dev python -m scripts.chat_reports"
"""

import argparse
import asyncio
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import app.models  # noqa: F401
from app.db.session import SessionLocal
from app.models import ChatMessage, ChatReport, User


async def hide(db: AsyncSession, message_id: int) -> bool:
    message = await db.get(ChatMessage, message_id)
    if message is None:
        return False
    message.hidden = True
    return True


async def resolve(db: AsyncSession, report_id: int) -> bool:
    report = await db.get(ChatReport, report_id)
    if report is None:
        return False
    report.resolved_at = datetime.now(timezone.utc)
    return True


async def delete_user(db: AsyncSession, user_id: uuid.UUID) -> bool:
    user = await db.get(User, user_id)
    if user is None:
        return False
    await db.delete(user)
    return True


async def open_reports(db: AsyncSession) -> list[ChatReport]:
    return list((await db.execute(select(ChatReport).where(ChatReport.resolved_at.is_(None))
                                  .order_by(ChatReport.created_at))).scalars())


async def main() -> None:
    parser = argparse.ArgumentParser(description="Review reported chat messages.")
    parser.add_argument("--hide", type=int, metavar="MESSAGE_ID")
    parser.add_argument("--resolve", type=int, metavar="REPORT_ID")
    parser.add_argument("--delete-user", type=uuid.UUID, metavar="USER_ID")
    args = parser.parse_args()

    async with SessionLocal() as db:
        if args.hide is not None and not await hide(db, args.hide):
            raise SystemExit(f"no message {args.hide}")
        if args.resolve is not None and not await resolve(db, args.resolve):
            raise SystemExit(f"no report {args.resolve}")
        if args.delete_user is not None and not await delete_user(db, args.delete_user):
            raise SystemExit(f"no user {args.delete_user}")
        await db.commit()

        reports = await open_reports(db)
        if not reports:
            print("No open reports.")
        for r in reports:
            print(f"#{r.id}  {r.created_at:%Y-%m-%d %H:%M}  message={r.message_id}  "
                  f"reported_user={r.reported_user_id}\n    {r.text!r}  reason={r.reason!r}")


if __name__ == "__main__":
    asyncio.run(main())

"""Review reported chat messages. Apple expects reports to be acted on promptly
(App Store 1.2), so check this regularly once the app is live.

    uv run python -m scripts.chat_reports                 # open reports
    uv run python -m scripts.chat_reports --hide 123      # hide message 123 for everyone
    uv run python -m scripts.chat_reports --resolve 7     # mark report 7 reviewed

Point DATABASE_URL at the environment you are reviewing (in Azure, run it as a
Container Apps job or from a shell with the managed identity).
"""

import argparse
import asyncio
from datetime import datetime, timezone

from sqlalchemy import select

import app.models  # noqa: F401
from app.db.session import SessionLocal
from app.models import ChatMessage, ChatReport


async def main() -> None:
    parser = argparse.ArgumentParser(description="Review reported chat messages.")
    parser.add_argument("--hide", type=int, metavar="MESSAGE_ID")
    parser.add_argument("--resolve", type=int, metavar="REPORT_ID")
    args = parser.parse_args()

    async with SessionLocal() as db:
        if args.hide is not None:
            message = await db.get(ChatMessage, args.hide)
            if message is None:
                raise SystemExit(f"no message {args.hide}")
            message.hidden = True
        if args.resolve is not None:
            report = await db.get(ChatReport, args.resolve)
            if report is None:
                raise SystemExit(f"no report {args.resolve}")
            report.resolved_at = datetime.now(timezone.utc)
        await db.commit()

        open_reports = (await db.execute(select(ChatReport).where(ChatReport.resolved_at.is_(None))
                                         .order_by(ChatReport.created_at))).scalars().all()
        if not open_reports:
            print("No open reports.")
        for r in open_reports:
            print(f"#{r.id}  {r.created_at:%Y-%m-%d %H:%M}  message={r.message_id}  "
                  f"reported_user={r.reported_user_id}\n    {r.text!r}  reason={r.reason!r}")


if __name__ == "__main__":
    asyncio.run(main())

"""table clean to go out

Revision ID: d9e2a7c4b1f8
Revises: c3b8f1d6a2e4
Create Date: 2026-11-18 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd9e2a7c4b1f8'
down_revision: Union[str, Sequence[str], None] = 'c3b8f1d6a2e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('game_tables', sa.Column('clean_to_go_out', sa.Boolean(), server_default=sa.false(), nullable=False))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('game_tables', 'clean_to_go_out')

"""table trincas allowed

Revision ID: f2c7d3a8b915
Revises: e4a1c9b2d7f3
Create Date: 2026-10-28 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f2c7d3a8b915'
down_revision: Union[str, Sequence[str], None] = 'e4a1c9b2d7f3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('game_tables', sa.Column('trincas_allowed', sa.Boolean(), server_default=sa.true(), nullable=False))
    # STBL never had trincas: keep its stored tables consistent with the new column.
    op.execute("UPDATE game_tables SET trincas_allowed = false WHERE preset = 'stbl'")


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('game_tables', 'trincas_allowed')

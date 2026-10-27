"""table rematch

Revision ID: e4a1c9b2d7f3
Revises: d05b9a14db05
Create Date: 2026-10-27 18:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e4a1c9b2d7f3'
down_revision: Union[str, Sequence[str], None] = 'd05b9a14db05'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('game_tables', sa.Column('rematch_id', sa.Uuid(), nullable=True))
    op.create_foreign_key('game_tables_rematch_id_fkey', 'game_tables', 'game_tables', ['rematch_id'], ['id'],
                          ondelete='SET NULL')


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('game_tables_rematch_id_fkey', 'game_tables', type_='foreignkey')
    op.drop_column('game_tables', 'rematch_id')

import type { DbHandle, DualMigration } from '../db/types'
import { computeClock, type ClockObservation } from './time'

export const LICENSE_STATE_NAMESPACE = 'license_state'
const TABLE = 'license_state'
const ROW = 'singleton'
const MIGRATIONS: DualMigration[] = [
  {
    version: 1,
    sqlite:
      'CREATE TABLE IF NOT EXISTS license_state (id TEXT PRIMARY KEY, max_seen_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);',
    postgres:
      'CREATE TABLE IF NOT EXISTS license_state (id TEXT PRIMARY KEY, max_seen_at BIGINT NOT NULL, updated_at BIGINT NOT NULL);',
  },
]

/**
 * The latest wall-clock time this deployment has seen: the clock-rollback guard
 * (handover §5.6). integration-server owns it on credHandle (D-A), and it is in
 * that service's db-copy profile. A BORROWER: it never closes the handle.
 * Replica-safe: the upsert keeps the larger value whoever writes last.
 *
 * Remedy for a forward clock spike: fix the clock, then delete the row
 * (DELETE FROM license_state) and restart. The next observation starts afresh.
 */
export class LicenseStateStore {
  private constructor(private readonly handle: DbHandle) {}

  static async create(handle: DbHandle): Promise<LicenseStateStore> {
    await handle.migrate(LICENSE_STATE_NAMESPACE, MIGRATIONS)
    return new LicenseStateStore(handle)
  }

  async maxSeenAt(): Promise<number | null> {
    const row = (await this.handle.kysely
      .selectFrom(TABLE)
      .select('max_seen_at')
      .where('id', '=', ROW)
      .executeTakeFirst()) as { max_seen_at: number | string } | undefined
    // Postgres returns BIGINT as a string.
    return row ? Number(row.max_seen_at) : null
  }

  /** Record `systemNowMs` (monotonically) and return the rollback-protected time. */
  async observe(systemNowMs: number): Promise<ClockObservation> {
    const now = Math.trunc(systemNowMs)
    const previous = await this.maxSeenAt()
    await this.handle.kysely
      .insertInto(TABLE)
      .values({ id: ROW, max_seen_at: now, updated_at: now })
      .onConflict((oc) =>
        oc.column('id').doUpdateSet((eb) => ({
          // Never backwards: a replica with a slower clock writing last keeps the larger value.
          max_seen_at: eb
            .case()
            .when(eb('excluded.max_seen_at', '>', eb.ref('license_state.max_seen_at')))
            .then(eb.ref('excluded.max_seen_at'))
            .else(eb.ref('license_state.max_seen_at'))
            .end(),
          updated_at: eb.ref('excluded.updated_at'),
        })),
      )
      .execute()
    return computeClock(now, previous)
  }
}

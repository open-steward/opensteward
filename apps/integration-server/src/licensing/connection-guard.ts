import type { CredentialStore } from '@opensteward/shared'
import {
  connectionReadOnlyRefusal,
  featureRefusal,
  limitRefusal,
  type LicenseError,
} from '@opensteward/shared/licensing'
import type { EntitlementSource } from './vertical-gate'

const DEFAULT_TTL_MS = 30_000

interface Snapshot {
  at: number
  limit: number
  count: number
  /** The oldest `limit` ids by (created_at, id), or null when the deployment is within its limit. */
  writable: ReadonlySet<string> | null
}
const allows = (s: Snapshot, id: string): boolean => s.writable === null || s.writable.has(id)

/**
 * The license limit on connections (P5/P6). Over the limit, the oldest N
 * connections by (created_at, id) keep writing and the rest are read-only.
 * Nothing is ever deleted.
 *
 * - `assertCanCreate` is the CredentialStore create guard, and the early check
 *   at the start routes. It always counts fresh, but takes no lock: two
 *   concurrent creates can both pass and go one over the limit. That is the
 *   soft check the tenant limit makes too, and the overflow is not lost: the
 *   write gate below makes the newest connection read-only.
 * - `writeRefusal` backs both auth middlewares' write gate. An allow may come
 *   from a snapshot up to ttlMs old. A refusal never does: it is re-checked
 *   against the database first. So a connection deleted through another
 *   replica, or through a path that fires no listener, frees its slot at once
 *   (Review Focus #4).
 */
export class ConnectionLicenseGuard {
  private cache: Snapshot | null = null

  constructor(
    private readonly opts: {
      store: Pick<CredentialStore, 'count' | 'listIdsInCreationOrder'>
      license: EntitlementSource
      ttlMs?: number
      now?: () => number
    },
  ) {}

  async assertCanCreate(vertical: string | null): Promise<void> {
    const ent = this.opts.license.entitlements()
    if (vertical && !ent.has(`vertical:${vertical}`)) {
      throw featureRefusal(ent.status(), `vertical:${vertical}`)
    }
    const limit = ent.limit('connections')
    const used = await this.opts.store.count()
    if (used >= limit) {
      throw limitRefusal('connections', limit, used, ent.status().entitlementSource)
    }
  }

  /** Never throws: a failed lookup lets the write through, to fail on its own. */
  async writeRefusal(connectionId: string): Promise<LicenseError | null> {
    try {
      const ent = this.opts.license.entitlements()
      const limit = ent.limit('connections')
      const now = (this.opts.now ?? Date.now)()
      const cached = this.cache
      const stale =
        cached === null ||
        cached.limit !== limit ||
        now - cached.at >= (this.opts.ttlMs ?? DEFAULT_TTL_MS)
      let snap: Snapshot = cached === null || stale ? await this.load(limit, now) : cached
      if (allows(snap, connectionId)) return null
      if (!stale) snap = await this.load(limit, now) // a refusal from the cache: re-check fresh
      if (allows(snap, connectionId)) return null
      return connectionReadOnlyRefusal(
        connectionId,
        limit,
        snap.count,
        ent.status().entitlementSource,
      )
    } catch {
      return null
    }
  }

  invalidate(): void {
    this.cache = null
  }

  private async load(limit: number, now: number): Promise<Snapshot> {
    const count = await this.opts.store.count()
    const writable =
      count > limit ? new Set(await this.opts.store.listIdsInCreationOrder(limit)) : null
    this.cache = { at: now, limit, count, writable }
    return this.cache
  }
}

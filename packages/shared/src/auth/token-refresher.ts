/**
 * TokenRefresher — the refresh path the sync workers take.
 *
 * Prevents a thundering herd when several concurrent callers share a
 * near-expired credential: the first triggers the refresh, the rest await the
 * same promise.
 *
 * Routing through `refreshWithRotationGuard` records every outcome — so
 * `last_refresh_at` / `last_refresh_status` reflect sync-driven refreshes,
 * not just the daily keep-alive worker's writes, and a failure here never
 * leaves a stale `'ok'` standing that `computeStatus()` reads as a live
 * grant — and inherits the cross-replica rotation-race retry (an
 * `invalid_grant` caused by another replica having already rotated the
 * token).
 */
import type { BaseAdapter } from '../adapter/base'
import type { Credentials } from './store'
import { refreshWithRotationGuard, type RefreshStore } from './refresh-runner'

/** Refresh when the token expires within this window. */
const DEFAULT_THRESHOLD_MS = 60_000

export class TokenRefresher<TAdapter extends BaseAdapter = BaseAdapter> {
  private refreshing = new Map<string, Promise<Credentials>>()

  constructor(private store: RefreshStore) {}

  /**
   * Returns credentials good for at least `thresholdMs`, refreshing first if
   * needed. Refreshes are deduped per connection id.
   *
   * Throws when the refresh fails, so the caller (sync worker, request path)
   * surfaces the failure rather than proceeding with a dead token — the
   * outcome is persisted either way.
   */
  async ensureFresh(
    adapter: TAdapter,
    credentials: Credentials,
    connectionId: string,
    thresholdMs: number = DEFAULT_THRESHOLD_MS,
  ): Promise<Credentials> {
    if (!credentials.expiresAt || credentials.expiresAt.getTime() - Date.now() >= thresholdMs) {
      return credentials
    }
    if (!adapter.refreshCredentials) return credentials

    if (!this.refreshing.has(connectionId)) {
      const promise = refreshWithRotationGuard(this.store, connectionId, credentials, (creds) =>
        adapter.refreshCredentials!(creds),
      )
        .then((result) => {
          if (result.outcome !== 'ok') throw new Error(`token refresh ${result.outcome}`)
          return result.credentials
        })
        .finally(() => this.refreshing.delete(connectionId))
      this.refreshing.set(connectionId, promise)
    }

    return this.refreshing.get(connectionId)!
  }
}

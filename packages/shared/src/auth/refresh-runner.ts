/**
 * Run an OAuth credential refresh with a *rotation-aware retry*, then persist
 * the result. Shared by every refresh call site (the two control-plane auth
 * middlewares and the keep-alive worker) so the retry logic lives in one place.
 *
 * Why this exists — the cross-replica rotation race:
 *
 *   The per-connection refresh lock (`refresh-lock.ts`) is in-process only.
 *   When integration-server runs >1 replica (the Helm default is 2), two pods
 *   can hit a connection's refresh window at the same instant and both call the
 *   provider's token endpoint with the *same* refresh token. For providers that
 *   ROTATE the refresh token on use (Xero, HubSpot, Microsoft, QuickBooks, …),
 *   the first call rotates the token and invalidates the one the second call is
 *   still holding. The second call then gets `invalid_grant` — even though the
 *   grant is perfectly alive and a freshly rotated token is already in the DB.
 *
 *   Naively, that `invalid_grant` is persisted as `last_refresh_status='expired'`
 *   which `computeStatus` treats as a hard, permanent failure: the connection
 *   shows "expired" forever despite a valid token sitting in the store and an
 *   active authorization on the platform.
 *
 * The guard: on `invalid_grant`, re-load the credentials. If the stored refresh
 * token now DIFFERS from the one we used, another replica just rotated it — so
 * retry the refresh once with the fresh token before giving up. Only a genuine
 * dead grant (token unchanged across a short re-read window, or the retry also
 * fails with invalid_grant) is reported as `expired`.
 *
 * Designed to run INSIDE `withRefreshLock` — the caller owns the lock. This
 * function never throws on a refresh failure; it persists the outcome and
 * returns it so the caller can react (401 / webhook / log).
 */
import type { Credentials, RefreshStatus } from './store'
import { classifyRefreshError, describeRefreshError, refreshStatusForError } from './refresh-error'

/** Minimal slice of `CredentialStore` this runner needs — keeps it test-friendly. */
export interface RefreshStore {
  loadById(connectionId: string): Promise<Credentials | null>
  updateById(connectionId: string, credentials: Credentials): Promise<void>
  updateRefreshStatus(
    connectionId: string,
    status: RefreshStatus,
    at?: number,
    reason?: string | null,
  ): Promise<void>
}

export type RefreshOutcome = 'ok' | 'failed' | 'expired' | 'platform_error'

export interface RefreshResult {
  outcome: RefreshOutcome
  /** The credentials to use going forward — fresh on success, the input on failure. */
  credentials: Credentials
  /** Why it failed, when it did — short, operator-readable, and free of the
   *  request echo. Absent on success. See `describeRefreshError`. */
  reason?: string
}

/**
 * Number of times to re-read the store looking for a rotated refresh token
 * before concluding the grant is genuinely dead. The losing replica observes
 * `invalid_grant` the instant the provider rejects its (now-stale) token, which
 * can be a beat before the winning replica commits the rotated token to the DB.
 * A few short re-reads absorb that commit-lag window.
 */
const ROTATION_RELOAD_ATTEMPTS = 3
const ROTATION_RELOAD_DELAY_MS = 200

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Perform `refresh(credentials)`, persisting the outcome via `store`. On a
 * cross-replica rotation race (`invalid_grant` while another replica rotated
 * the token) retries once with the freshly persisted token. Never throws for
 * refresh failures — inspect `result.outcome`.
 */
export async function refreshWithRotationGuard(
  store: RefreshStore,
  connectionId: string,
  credentials: Credentials,
  refresh: (creds: Credentials) => Promise<Credentials>,
): Promise<RefreshResult> {
  try {
    const fresh = await refresh(credentials)
    await store.updateById(connectionId, fresh)
    await store.updateRefreshStatus(connectionId, 'ok')
    return { outcome: 'ok', credentials: fresh }
  } catch (err) {
    // Only the dead-grant case can be a rotation race. invalid_client and
    // transient errors are passed straight through to the normal mapping.
    if (classifyRefreshError(err) === 'invalid_grant') {
      const rotated = await findRotatedCredentials(store, connectionId, credentials.refreshToken)
      if (rotated) {
        try {
          const fresh = await refresh(rotated)
          await store.updateById(connectionId, fresh)
          await store.updateRefreshStatus(connectionId, 'ok')
          return { outcome: 'ok', credentials: fresh }
        } catch (retryErr) {
          const status = refreshStatusForError(retryErr)
          const reason = describeRefreshError(retryErr)
          await store.updateRefreshStatus(connectionId, status, Date.now(), reason)
          return { outcome: status, credentials, reason }
        }
      }
    }
    // The error is classified, persisted AND described. Persisting only the
    // status would leave a connection failing to refresh for hours with the
    // cause nowhere on record.
    const status = refreshStatusForError(err)
    const reason = describeRefreshError(err)
    await store.updateRefreshStatus(connectionId, status, Date.now(), reason)
    return { outcome: status, credentials, reason }
  }
}

/**
 * Re-read the stored credentials looking for a refresh token that differs from
 * `usedToken` — evidence that another replica rotated it out from under us.
 * Returns the rotated credentials, or null if none appeared within the window.
 */
async function findRotatedCredentials(
  store: RefreshStore,
  connectionId: string,
  usedToken: string | undefined,
): Promise<Credentials | null> {
  for (let attempt = 0; attempt < ROTATION_RELOAD_ATTEMPTS; attempt++) {
    const latest = await store.loadById(connectionId)
    if (latest?.refreshToken && latest.refreshToken !== usedToken) return latest
    if (attempt < ROTATION_RELOAD_ATTEMPTS - 1) await sleep(ROTATION_RELOAD_DELAY_MS)
  }
  return null
}

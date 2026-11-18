/**
 * RefreshKeepAliveWorker — periodically refreshes every active OAuth
 * connection so rotating-refresh providers (Xero, HubSpot, Microsoft,
 * QuickBooks, …) stay alive even when the connection is idle. The
 * existing on-request refresh in `auth-middleware.ts` only fires when
 * customers make API calls; idle connections silently lapse past the
 * provider's idle cap (60–100 days) without it.
 *
 * On hard-failure (`invalid_grant` / `unauthorized_client`) the worker
 * marks the connection as authorization-expired, which surfaces as
 * `status: 'expired'` to the admin UI and as a `connection.authorization_expired`
 * outbound webhook event.
 */
import {
  CredentialStore,
  type ConnectionRow,
  type Credentials,
  withRefreshLock,
  refreshWithRotationGuard,
} from '@opensteward/shared'
import type { UnifiedAdapterRegistry } from '@opensteward/shared'

export interface RefreshKeepAliveWorkerOptions {
  store: CredentialStore
  registry: UnifiedAdapterRegistry
  /** How often the worker ticks. Defaults to 15 minutes — short enough that a
   *  one-hour access token is renewed before it lapses. */
  intervalMs?: number
  /** Anti-thrash floor: never re-pick a row refreshed this recently.
   *  Defaults to 5 minutes. */
  skipWindowMs?: number
  /** Renew a token lapsing inside this window. Defaults to 30 minutes — two
   *  ticks of headroom, so one missed tick does not strand a connection. */
  expiringWithinMs?: number
  /** Cadence for grants with no access-token expiry: nothing to keep fresh,
   *  just exercised occasionally so providers that drop unused refresh tokens
   *  don't. Defaults to 20h. */
  keepWarmMs?: number
  /** How often to retry rows that previously failed with a hard-expired error.
   *  Defaults to 7d. Not zero so we eventually pick up cases where the customer
   *  re-authorized externally and the new token is back in the store via a
   *  separate connection callback. */
  deadRetryMs?: number
  /** How many candidates to process per tick. Defaults to 50. */
  batchSize?: number
  /** Sleep between connections within a batch. Defaults to 200ms — gentle
   *  pressure on token endpoints. */
  perConnectionDelayMs?: number
  /** Optional hook fired when a refresh hard-fails because the customer's
   *  grant died (invalid_grant). Used by the integration server to dispatch a
   *  `connection.authorization_expired` outbound webhook event. */
  onAuthorizationExpired?: (row: ConnectionRow) => void | Promise<void>
  /** Optional hook fired when a refresh fails because the platform's OAuth
   *  client credentials were rejected (invalid_client). Used to dispatch a
   *  `connection.platform_credentials_invalid` outbound webhook event. The
   *  fix is operator-side (client id/secret), not customer re-authorization. */
  onPlatformCredentialsInvalid?: (row: ConnectionRow) => void | Promise<void>
  /** Logger. Falls back to console. */
  logger?: {
    info: (msg: string, ...args: unknown[]) => void
    warn: (msg: string, ...args: unknown[]) => void
    error: (msg: string, ...args: unknown[]) => void
  }
}

const DAY = 24 * 60 * 60 * 1000

export class RefreshKeepAliveWorker {
  private timer: ReturnType<typeof setInterval> | null = null
  private running = false
  private readonly intervalMs: number
  private readonly skipWindowMs: number
  private readonly expiringWithinMs: number
  private readonly keepWarmMs: number
  private readonly deadRetryMs: number
  private readonly batchSize: number
  private readonly perConnectionDelayMs: number

  constructor(private opts: RefreshKeepAliveWorkerOptions) {
    this.intervalMs = opts.intervalMs ?? 15 * 60 * 1000
    this.skipWindowMs = opts.skipWindowMs ?? 5 * 60 * 1000
    this.expiringWithinMs = opts.expiringWithinMs ?? 30 * 60 * 1000
    this.keepWarmMs = opts.keepWarmMs ?? 20 * 60 * 60 * 1000
    this.deadRetryMs = opts.deadRetryMs ?? 7 * DAY
    this.batchSize = opts.batchSize ?? 50
    this.perConnectionDelayMs = opts.perConnectionDelayMs ?? 200
  }

  start(): void {
    if (this.timer) return
    void this.tick()
    this.timer = setInterval(() => void this.tick(), this.intervalMs)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  /** Run one pass. Exposed for tests + manual ops triggers. */
  async tick(): Promise<{
    ok: number
    failed: number
    expired: number
    platformError: number
    skipped: number
  }> {
    if (this.running) return { ok: 0, failed: 0, expired: 0, platformError: 0, skipped: 0 }
    this.running = true
    const log = this.opts.logger ?? console
    let ok = 0
    let failed = 0
    let expired = 0
    let platformError = 0
    let skipped = 0
    try {
      const candidates = await this.opts.store.listRefreshCandidates({
        skipWindowMs: this.skipWindowMs,
        deadRetryMs: this.deadRetryMs,
        limit: this.batchSize,
        expiringWithinMs: this.expiringWithinMs,
        keepWarmMs: this.keepWarmMs,
      })
      log.info(`[refresh-keep-alive] tick: ${candidates.length} candidates`)
      for (const row of candidates) {
        const outcome = await this.attemptRefresh(row)
        if (outcome === 'ok') ok++
        else if (outcome === 'expired') expired++
        else if (outcome === 'platform_error') platformError++
        else if (outcome === 'failed') failed++
        else skipped++
        if (this.perConnectionDelayMs > 0) {
          await new Promise((r) => setTimeout(r, this.perConnectionDelayMs))
        }
      }
      if (candidates.length > 0) {
        log.info(
          `[refresh-keep-alive] done: ok=${ok} expired=${expired} platform_error=${platformError} failed=${failed} skipped=${skipped}`,
        )
      }
    } catch (err) {
      log.error('[refresh-keep-alive] tick error', err)
    } finally {
      this.running = false
    }
    return { ok, failed, expired, platformError, skipped }
  }

  /** @internal — exported for tests. */
  async attemptRefresh(
    row: ConnectionRow,
  ): Promise<'ok' | 'failed' | 'expired' | 'platform_error' | 'skipped'> {
    const log = this.opts.logger ?? console
    if (!row.vertical) return 'skipped'

    let credentials: Credentials | null
    try {
      credentials = await this.opts.store.loadById(row.id)
    } catch (err) {
      log.warn(`[refresh-keep-alive] decrypt failed for ${row.id}`, err)
      return 'skipped'
    }
    if (!credentials || !credentials.refreshToken) return 'skipped'

    const adapter = this.opts.registry.get(row.vertical, row.platform)
    if (!adapter || !adapter.refreshCredentials) return 'skipped'

    let outcome: 'ok' | 'failed' | 'expired' | 'platform_error' = 'failed'
    // Did we run the refresh, or only observe another caller's in-flight one?
    // `withRefreshLock` resolves `undefined` for observers, which is
    // indistinguishable from the acquirer's own void return — this flag is.
    let heldLock = false
    try {
      await withRefreshLock(row.id, async () => {
        heldLock = true
        // Rotation guard: on a cross-replica race the loser sees invalid_grant
        // even though the grant is alive; the guard retries with the rotated
        // token before reporting 'expired'. Persists the outcome internally.
        const res = await refreshWithRotationGuard(this.opts.store, row.id, credentials!, (creds) =>
          adapter.refreshCredentials!(creds),
        )
        outcome = res.outcome
        if (res.outcome === 'failed') {
          // Log the reason, not just the fact, so an operator can tell a
          // network outage from an OAuth rejection the classifier does not
          // recognise.
          log.warn(
            `[refresh-keep-alive] transient error refreshing ${row.id} (retry next tick): ${res.reason ?? 'no reason recorded'}`,
          )
        }
      })
      if (!heldLock) {
        // We waited on another holder, so `outcome` above was never assigned.
        // The holder persists its result before releasing — re-read it rather
        // than reporting our initialised default as a failure of our own.
        //
        // But only trust a row the holder actually wrote while we waited.
        // Releasing is not the same as recording: the Redis backend also stops
        // waiting when the lock's TTL expires under a dead holder, and the
        // fail-open path drops the cross-replica lock entirely. Inheriting
        // `last_refresh_status` from a row nobody touched is the same stale-'ok'
        // report this whole branch exists to stop. `last_refresh_at` moves on
        // every persisted outcome, so a value identical to the one we selected
        // this candidate with means nothing was written.
        const fresh = await this.opts.store.getRow(row.id)
        const persisted =
          fresh && fresh.lastRefreshAt != null && fresh.lastRefreshAt !== row.lastRefreshAt
            ? fresh
            : null
        if (!persisted) {
          log.warn(
            `[refresh-keep-alive] waited on an in-flight refresh for ${row.id} (${row.vertical}/${row.platform}) that recorded no outcome; reporting failed rather than inheriting the stored status`,
          )
        }
        outcome =
          persisted?.lastRefreshStatus === 'ok' ||
          persisted?.lastRefreshStatus === 'expired' ||
          persisted?.lastRefreshStatus === 'platform_error'
            ? persisted.lastRefreshStatus
            : 'failed'
      }
    } catch (err) {
      // A throw here is NOT a rejected refresh — `refreshWithRotationGuard`
      // classifies, persists and returns those. It means the persistence
      // itself failed (locked DB, read-only volume, dead Postgres), either for
      // us or for the holder we were waiting on. So nothing trustworthy was
      // written and the row still carries whatever the last healthy tick left
      // there — usually 'ok'. Re-reading the row here would report a stale
      // 'ok' and hide both failures; the two outcomes must stay
      // distinguishable.
      log.error(
        `[refresh-keep-alive] refresh threw for ${row.id} (${row.vertical}/${row.platform}); stored status is stale`,
        err,
      )
      outcome = 'failed'
    }

    if (outcome === 'expired' && this.opts.onAuthorizationExpired) {
      try {
        await this.opts.onAuthorizationExpired(row)
      } catch (err) {
        log.error('[refresh-keep-alive] onAuthorizationExpired hook failed', err)
      }
    } else if (outcome === 'platform_error' && this.opts.onPlatformCredentialsInvalid) {
      try {
        await this.opts.onPlatformCredentialsInvalid(row)
      } catch (err) {
        log.error('[refresh-keep-alive] onPlatformCredentialsInvalid hook failed', err)
      }
    }
    return outcome
  }
}

/**
 * LogoFetchWorker — runs the operator-triggered platform logo fetch.
 *
 * Modelled on AuditRetentionWorker (a `setInterval` with a guarded body) rather
 * than SyncWorker: Brandfetch rate-limits per IP, so concurrency here is
 * unconditionally 1 and SyncWorker's per-connection concurrency map would be
 * dead weight.
 *
 * Two replicas of admin-api run this loop. `LogoStore.claim()` is what makes
 * exactly one of them own a given job, and `reapStale()` is what recovers a job
 * whose owner disappeared — see the comments on those methods.
 *
 * Settings are read from `RuntimeSettingsStore` directly rather than through a
 * `RuntimeSettingsClient`: admin-api owns that table, and HTTP-calling itself to
 * read its own database would be absurd.
 */
import { hostname } from 'node:os'
import { randomUUID } from 'node:crypto'
import {
  fetchLogos,
  BrandfetchRejectedError,
  BrandfetchBlockedError,
} from '@opensteward/codegen/logos'
import type { PlatformLike, FetchLogoProgress } from '@opensteward/codegen/logos'
import { SETTING } from '@opensteward/shared'
import type { LogoStore, LogoFetchProgress } from '../db/logo-store'
import { emptyProgress } from '../db/logo-store'
import type { RuntimeSettingsStore } from '../db/runtime-settings-store'
import type { AdminStore } from '../db/admin-store'
import type { UnifiedClient } from '../proxy/client'

const POLL_INTERVAL_MS = 5_000
const HEARTBEAT_MS = 15_000
/** Four missed heartbeats. Below this, a slow database write looks like death. */
const STALE_AFTER_MS = 60_000
const MAX_ATTEMPTS = 3
/** Flush progress at whichever of these comes first. */
const FLUSH_EVERY_N = 25
const FLUSH_EVERY_MS = 2_000
/**
 * Consecutive rate-limited platforms before the run gives up. A full catalog
 * exceeds Brandfetch's published cap, so isolated throttles are normal and must
 * not fail the job; a sustained wall means the delay is set too low and forty
 * more minutes of retrying will not help.
 */
const THROTTLE_CIRCUIT_BREAK = 20
/** Job-history sweep cadence. The retention window itself is operator-set. */
const CLEANUP_EVERY_MS = 60 * 60 * 1000

export interface LogoFetchWorkerOptions {
  logoStore: LogoStore
  settings: RuntimeSettingsStore
  unifiedClient: UnifiedClient
  adminStore?: AdminStore
  /**
   * Browser-facing origin of this deployment (config.sso.adminUiUrl). Used as
   * the Referer when the operator has not set `logos.fetch_referer`, so the
   * header carries the request's real origin rather than this project's URL.
   */
  adminUiUrl?: string
  pollIntervalMs?: number
  heartbeatMs?: number
  staleAfterMs?: number
  maxAttempts?: number
  logger?: {
    info(msg: string): void
    warn(msg: string, err?: unknown): void
    error(msg: string, err?: unknown): void
  }
}

interface CatalogRow {
  slug?: string
  website?: string
  vertical?: string
  name?: string
  auth_type?: string
  authType?: string
  [key: string]: unknown
}

export class LogoFetchWorker {
  private timer: ReturnType<typeof setInterval> | null = null
  private busy = false
  private lastCleanupAt = 0
  private readonly workerId = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`
  private readonly opts: Required<
    Omit<LogoFetchWorkerOptions, 'logger' | 'adminStore' | 'adminUiUrl'>
  > &
    Pick<LogoFetchWorkerOptions, 'logger' | 'adminStore' | 'adminUiUrl'>

  constructor(options: LogoFetchWorkerOptions) {
    this.opts = {
      logoStore: options.logoStore,
      settings: options.settings,
      unifiedClient: options.unifiedClient,
      adminStore: options.adminStore,
      adminUiUrl: options.adminUiUrl,
      pollIntervalMs: options.pollIntervalMs ?? POLL_INTERVAL_MS,
      heartbeatMs: options.heartbeatMs ?? HEARTBEAT_MS,
      staleAfterMs: options.staleAfterMs ?? STALE_AFTER_MS,
      maxAttempts: options.maxAttempts ?? MAX_ATTEMPTS,
      logger: options.logger,
    }
  }

  start(): void {
    if (this.timer) return
    void this.runOnce()
    this.timer = setInterval(() => void this.runOnce(), this.opts.pollIntervalMs)
    this.timer.unref?.()
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  /** One tick. Exported for tests; safe to call directly. */
  async runOnce(): Promise<void> {
    if (this.busy) return
    this.busy = true
    try {
      await this.opts.logoStore.reapStale(this.opts.staleAfterMs, this.opts.maxAttempts)
      await this.sweepJobHistory()

      const pending = await this.opts.logoStore.findPending()
      if (!pending) return

      const won = await this.opts.logoStore.claim(pending.id, this.workerId)
      if (!won) return // another replica got there first

      await this.run(pending.id)
    } catch (err) {
      this.opts.logger?.error('[logo-fetch] tick failed', err)
    } finally {
      this.busy = false
    }
  }

  /**
   * Drop finished job rows past the retention window.
   *
   * Runs off the existing tick rather than its own timer — the poll is already
   * here, and the sweep is one indexed DELETE. Without it the table grows
   * without bound: purging the library clears history, but purging is manual
   * and an operator who never does it accumulates a row per run forever.
   */
  private async sweepJobHistory(): Promise<void> {
    const now = Date.now()
    if (now - this.lastCleanupAt < CLEANUP_EVERY_MS) return
    this.lastCleanupAt = now
    try {
      const raw = (await this.opts.settings.get(SETTING.LOGOS_JOB_RETENTION_DAYS))?.value
      const days = typeof raw === 'number' ? raw : 30
      if (!Number.isFinite(days) || days <= 0) return // keep forever
      const deleted = await this.opts.logoStore.cleanup(days)
      if (deleted > 0) {
        this.opts.logger?.info(`[logo-fetch] pruned ${deleted} job row(s) older than ${days}d`)
      }
    } catch (err) {
      // Retention is housekeeping; never let it stop a fetch from running.
      this.opts.logger?.warn('[logo-fetch] job-history sweep failed', err)
    }
  }

  private async run(jobId: string): Promise<void> {
    const { logoStore, settings, unifiedClient, logger } = this.opts

    const job = await logoStore.getJob(jobId)
    if (!job) return

    const clientId = String(
      (await settings.get(SETTING.LOGOS_BRANDFETCH_CLIENT_ID))?.value ?? '',
    ).trim()
    if (!clientId) {
      // Never fall back to process.env here. The admin UI is the source of
      // truth for this value, and silently using a different client ID than
      // the one on screen would be impossible to debug.
      await logoStore.markFailed(
        jobId,
        'No Brandfetch client ID is set. Add one under Platforms → Logos, then start the fetch again.',
      )
      return
    }

    const delaySetting = (await settings.get(SETTING.LOGOS_FETCH_DELAY_MS))?.value
    const delayMs = typeof delaySetting === 'number' && delaySetting > 0 ? delaySetting : 400
    // Brandfetch requires the Referer to carry the request origin, and refuses
    // traffic that does not look like a logo embedded in a page. Send this
    // deployment's own origin — never the project's repo URL, which would both
    // misstate who is asking and step around that check.
    const configuredReferer = String(
      (await settings.get(SETTING.LOGOS_FETCH_REFERER))?.value ?? '',
    ).trim()
    let companyBaseUrl = ''
    try {
      companyBaseUrl = String((await this.opts.adminStore?.getCompanyInfo())?.baseUrl ?? '').trim()
    } catch {
      // Branding is optional; fall through to the configured admin UI origin.
    }
    const referer = configuredReferer || companyBaseUrl || (this.opts.adminUiUrl ?? '').trim()
    if (!referer) {
      await logoStore.markFailed(
        jobId,
        'No origin is configured to send as the Referer, which Brandfetch requires. ' +
          'Set logos.fetch_referer under Settings to this deployment’s public URL.',
      )
      return
    }

    let catalog: CatalogRow[]
    try {
      catalog = (await unifiedClient.listCatalog()) as CatalogRow[]
    } catch (err) {
      await logoStore.markFailed(
        jobId,
        `Could not read the platform catalog from the integration-server: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
      return
    }

    const verticalBySlug = new Map<string, string>()
    const platforms: PlatformLike[] = []
    for (const row of catalog) {
      if (!row.slug || !row.website) continue
      if (job.vertical && row.vertical !== job.vertical) continue
      if (job.slug && row.slug !== job.slug) continue
      verticalBySlug.set(row.slug, row.vertical ?? 'unknown')
      platforms.push({
        slug: row.slug,
        name: row.name ?? row.slug,
        website: row.website,
        authType: row.auth_type ?? row.authType ?? '',
      })
    }

    if (platforms.length === 0) {
      await logoStore.markCompleted(jobId, emptyProgress(0))
      return
    }

    const progress = emptyProgress(platforms.length)
    for (const slug of verticalBySlug.keys()) {
      const v = verticalBySlug.get(slug)!
      progress.byVertical[v] ??= { total: 0, processed: 0, fetched: 0, skipped: 0, notFound: 0 }
      progress.byVertical[v].total++
    }

    // One query, not 1,545: which platforms already have bytes. This is also
    // what makes a requeued job cheap — it skips everything a previous attempt
    // stored.
    const satisfied = await logoStore.satisfiedSlugs()

    const abort = new AbortController()
    const startedAt = Date.now()
    let lastFlush = 0
    let sinceFlush = 0
    let consecutiveThrottles = 0
    let circuitBroken = false

    const flush = async (force = false): Promise<void> => {
      const now = Date.now()
      if (!force && sinceFlush < FLUSH_EVERY_N && now - lastFlush < FLUSH_EVERY_MS) return
      lastFlush = now
      sinceFlush = 0
      await logoStore.heartbeat(jobId, progress)
      // The same write is the cancellation checkpoint: a cancel usually lands
      // on the replica that is NOT running this job, so the only way to notice
      // is to re-read our own row.
      const fresh = await logoStore.getJob(jobId)
      if (fresh?.status === 'cancelling') abort.abort()
    }

    const onProgress = async (p: FetchLogoProgress): Promise<void> => {
      const vertical = verticalBySlug.get(p.slug) ?? 'unknown'
      const bucket = (progress.byVertical[vertical] ??= {
        total: 0,
        processed: 0,
        fetched: 0,
        skipped: 0,
        notFound: 0,
      })

      progress.processed++
      bucket.processed++
      progress.currentSlug = p.slug
      progress.currentVertical = vertical

      if (p.outcome === 'fetched') {
        progress.fetched++
        bucket.fetched++
        consecutiveThrottles = 0
      } else if (p.outcome === 'skipped') {
        progress.skipped++
        bucket.skipped++
      } else if (p.outcome === 'not_found') {
        progress.notFound++
        bucket.notFound++
        consecutiveThrottles = 0
      } else if (p.outcome === 'throttled') {
        progress.throttled++
        progress.lastError = 'Brandfetch is rate-limiting; backing off.'
        if (++consecutiveThrottles >= THROTTLE_CIRCUIT_BREAK) {
          circuitBroken = true
          abort.abort()
        }
      }

      // Below ~20 samples the estimate swings wildly enough to be a lie.
      if (progress.processed >= 20) {
        const perItem = (Date.now() - startedAt) / progress.processed
        progress.etaMs = Math.round(perItem * (progress.total - progress.processed))
      }

      sinceFlush++
      await flush()
    }

    try {
      const result = await fetchLogos(platforms, null, {
        clientId,
        referer,
        delayMs,
        force: job.force,
        signal: abort.signal,
        isSatisfied: (slug) => !job.force && satisfied.has(slug),
        onLogo: async (logo) => {
          await logoStore.putLogo({
            slug: logo.slug,
            ext: logo.ext,
            contentType: logo.contentType,
            bytes: logo.bytes,
            sourceDomain: logo.domain,
            fetchedBy: jobId,
          })
        },
        onProgress,
        log: (line) => logger?.info(`[logo-fetch] ${line}`),
        throttle: { maxRetries: 3, baseDelayMs: 5_000 },
      })

      progress.currentSlug = null
      progress.currentVertical = null

      if (circuitBroken) {
        await logoStore.markFailed(
          jobId,
          `Brandfetch rate-limited ${THROTTLE_CIRCUIT_BREAK} platforms in a row. Raise ` +
            `${SETTING.LOGOS_FETCH_DELAY_MS} and run it again — the ${progress.fetched} logos ` +
            'already fetched are kept, and the retry skips them.',
          progress,
        )
      } else if (result.cancelled) {
        await logoStore.markCancelled(jobId, progress)
      } else {
        await logoStore.markCompleted(jobId, progress)
      }
      await this.audit(
        jobId,
        progress,
        circuitBroken ? 'failed' : result.cancelled ? 'cancelled' : 'completed',
        startedAt,
      )
    } catch (err) {
      const message =
        err instanceof BrandfetchBlockedError || err instanceof BrandfetchRejectedError
          ? err.message
          : `Logo fetch failed: ${err instanceof Error ? err.message : String(err)}`
      logger?.warn('[logo-fetch] job failed', err)
      await logoStore.markFailed(jobId, message, progress)
      await this.audit(jobId, progress, 'failed', startedAt)
    }
  }

  private async audit(
    jobId: string,
    progress: LogoFetchProgress,
    status: string,
    startedAt: number,
  ): Promise<void> {
    // Best-effort, and never at the cost of the job's own outcome.
    try {
      await this.opts.adminStore?.writeAudit({
        userId: 'system',
        action: 'logo_fetch.finish',
        detail: {
          jobId,
          status,
          fetched: progress.fetched,
          skipped: progress.skipped,
          notFound: progress.notFound,
          throttled: progress.throttled,
          durationMs: Date.now() - startedAt,
        },
      })
    } catch {
      /* audit is not load-bearing for the fetch */
    }
  }
}

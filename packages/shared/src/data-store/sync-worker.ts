/**
 * SyncWorker — in-process background job processor for sync jobs.
 *
 * Polls the SyncStore for pending jobs (scoped to one vertical) and processes
 * them by walking the vertical's `LISTABLE_RESOURCES` table and bulk-upserting
 * canonical rows into the shared ResourceStore.
 *
 * Generic over <TAdapter extends BaseAdapter>: each vertical instantiates one
 * worker bound to its own adapter type. All workers share a single SyncStore
 * + ResourceStore (one DB file).
 */

import type { Credentials, CredentialStore } from '../auth/store'
import type { BaseAdapter } from '../adapter/base'
import type { AdapterRegistry } from '../adapter/registry'
import type { CircuitBreaker } from '../circuit-breaker'
import {
  withPageSink,
  readUpstreamPage,
  declaredPageMax,
  effectivePageSize,
  type PageMaxBearing,
} from '../adapter/page-meta'
import type { WebhookSubscriptionStore } from '../auth/webhook-subscriptions'
import type { WebhookDeliveryStore } from '../auth/webhook-deliveries'
import { emitTenantEvent } from '../control-plane/event-emitter'
import { sendCallback } from './callback'
import type { ListableResource, ResourceProgress, SyncJob } from './sync-schema'
import type { ResourceStore, RawPayloadPolicy } from './resource-store'
import { describeSyncError, isRefusal } from './sync-error'
import { stripRawPayloads } from './strip-raw-payload'
import type { SyncStore } from './sync-store'

/** Structural interface every per-vertical TokenRefresher already satisfies. */
export interface TokenRefresherLike<TAdapter extends BaseAdapter> {
  ensureFresh(
    adapter: TAdapter,
    credentials: Credentials,
    connectionId: string,
    thresholdMs?: number,
  ): Promise<Credentials>
}

export interface SyncWorkerLogger {
  info: (msg: string) => void
  warn: (msg: string) => void
  error: (msg: string) => void
}

export interface SyncWorkerConfig {
  pollIntervalMs?: number
  maxConcurrency?: number
  pageSize?: number
  /**
   * Hard ceiling on pages fetched per resource type before the sync fails.
   *
   * The loop's only natural exit is a short page, which assumes the adapter
   * honours `page`. One that ignores it returns the same full page forever
   * and the worker never stops — not hypothetical: Xero's `listAccounts`
   * ignored its params entirely until Finding 16. With 1,545 adapters, a
   * termination condition that depends on all of them behaving needs its own
   * bound.
   *
   * Default 10,000 — at the 500 default page size that is 5,000,000 records,
   * far beyond any real collection, so it only ever fires on a genuine
   * runaway.
   */
  maxPagesPerResource?: number
  /** When true, emit one `resource.synced` event per page (items[]) instead
   *  of one event per resource. Reduces event volume on large syncs at the
   *  cost of less granular replay. */
  batchEvents?: boolean
}

/** External-mode hooks. When supplied, every page upserted into the
 *  ResourceStore also fires a `resource.synced` outbound event for the
 *  job's connection tenant. */
export interface SyncWorkerExternalHooks {
  webhookSubs: WebhookSubscriptionStore
  webhookDeliveries?: WebhookDeliveryStore
  /** Resolves the tenant that owns a given connection. Falls back to
   *  `connections.tenant_id` from the credential store row when omitted. */
  resolveTenantId?: (connectionId: string) => string | null
}

export interface SyncWorkerOptions<TAdapter extends BaseAdapter> {
  vertical: string
  syncStore: SyncStore
  credentialStore: CredentialStore
  registry: AdapterRegistry<TAdapter>
  circuitBreaker: CircuitBreaker
  resourceStore: ResourceStore
  tokenRefresher: TokenRefresherLike<TAdapter>
  listableResources: readonly ListableResource[]
  config?: SyncWorkerConfig
  logger?: SyncWorkerLogger
  /** Optional. When provided (external mode), bulk upserts emit
   *  `resource.synced` events through the existing webhook delivery system. */
  external?: SyncWorkerExternalHooks
  /**
   * Whether this vertical's upstream payload may be kept. Bulk sync reaches
   * both the cache and outbound `resource.synced` bodies without going through
   * the router helpers, so it needs the policy of its own. Omit and everything
   * is kept.
   */
  rawPayloadEnabled?: RawPayloadPolicy
  /**
   * The normalizer fingerprint readers filter on — the same function the host
   * hands its read routers. Every row a sync writes, and the completeness
   * marker it sets, carry it.
   *
   * Without it the rows and marker are unversioned, which a versioned reader
   * never serves: in integration-server, whose routers are all versioned,
   * nothing a sync wrote reached a reader. Worse, an unversioned write
   * overwrites a row a read had stamped, hiding it from every cached list until
   * the next read restamped it. Omit only where nothing reads by version.
   */
  normalizerVersion?: (vertical: string, platform: string) => string
  /** Optional. Fired once per job after `markCompleted` / `markFailed`,
   *  before the per-job `callbackUrl` POST. Used by the host service to
   *  drive deployment-specific cleanup (e.g. one-time Connect Link
   *  sessions auto-revoke their connection here). Hook errors are
   *  logged and swallowed — they never break the worker. */
  onJobComplete?: (job: SyncJob, status: 'completed' | 'failed') => void | Promise<void>
  /**
   * Optional. Why `platform` does not provide `resource`, from the adapter's
   * own declaration (integration-server reads `adapters/<slug>/metadata.ts`
   * `unavailableResources`). Asked only for a resource the adapter has no
   * list method for; the answer becomes that resource's progress `error`
   * ("Not provided by <platform>: <reason>") instead of a bare 'skipped'.
   * `undefined`, or a throw, leaves the bare skip. It never fails a job.
   */
  unavailableReason?: (
    platform: string,
    resource: ListableResource,
  ) => string | undefined | Promise<string | undefined>
}

type ListFn = (
  creds: Credentials,
  params: Record<string, unknown>,
) => Promise<Array<{ id: string }>>

export class SyncWorker<TAdapter extends BaseAdapter> {
  private timer: ReturnType<typeof setInterval> | null = null
  /** Jobs running here, by job id — what `maxConcurrency` and `stop()`'s
   *  drain count. */
  private inFlightJobs = new Set<string>()
  /**
   * Connections with a job running here. An admin cancel marks a running job
   * failed, which frees the connection's database slot without interrupting
   * the run, so this set — passed to `claimNext` — is what keeps this worker
   * from starting that connection's next job beside the cancelled one.
   */
  private inFlightConnections = new Set<string>()
  private abortControllers = new Map<string, AbortController>()
  private processing = false

  private readonly vertical: string
  private readonly syncStore: SyncStore
  private readonly credentialStore: CredentialStore
  private readonly registry: AdapterRegistry<TAdapter>
  private readonly circuitBreaker: CircuitBreaker
  private readonly resourceStore: ResourceStore
  private readonly rawPayloadEnabled: RawPayloadPolicy | undefined
  private readonly normalizerVersion: SyncWorkerOptions<TAdapter>['normalizerVersion']
  private readonly tokenRefresher: TokenRefresherLike<TAdapter>
  private readonly listableResources: readonly ListableResource[]
  private readonly pollIntervalMs: number
  private readonly maxConcurrency: number
  private readonly pageSize: number
  private readonly maxPagesPerResource: number
  private readonly batchEvents: boolean
  private readonly external: SyncWorkerExternalHooks | undefined
  private readonly onJobComplete: SyncWorkerOptions<TAdapter>['onJobComplete']
  private readonly unavailableReason: SyncWorkerOptions<TAdapter>['unavailableReason']
  private readonly logger: SyncWorkerLogger

  constructor(opts: SyncWorkerOptions<TAdapter>) {
    // A resource type is one cached collection, and each entry sweeps its own
    // at its end: a second entry of the same type would remove every row the
    // first had just written. Refused loudly rather than left to a table edit.
    const seen = new Set<string>()
    for (const { resourceType } of opts.listableResources) {
      if (seen.has(resourceType)) {
        throw new Error(
          `SyncWorker(${opts.vertical}): resource type '${resourceType}' is listed twice in listableResources`,
        )
      }
      seen.add(resourceType)
    }
    this.vertical = opts.vertical
    this.syncStore = opts.syncStore
    this.credentialStore = opts.credentialStore
    this.registry = opts.registry
    this.circuitBreaker = opts.circuitBreaker
    this.resourceStore = opts.resourceStore
    this.rawPayloadEnabled = opts.rawPayloadEnabled
    this.normalizerVersion = opts.normalizerVersion
    this.tokenRefresher = opts.tokenRefresher
    this.listableResources = opts.listableResources
    this.pollIntervalMs = opts.config?.pollIntervalMs ?? 1000
    this.maxConcurrency = opts.config?.maxConcurrency ?? 2
    this.pageSize = opts.config?.pageSize ?? 500
    this.maxPagesPerResource = opts.config?.maxPagesPerResource ?? 10_000
    this.batchEvents = opts.config?.batchEvents ?? false
    this.external = opts.external
    this.onJobComplete = opts.onJobComplete
    this.unavailableReason = opts.unavailableReason
    this.logger = opts.logger ?? {
      info: (msg) => console.log(`[sync:${opts.vertical}] ${msg}`),
      warn: (msg) => console.warn(`[sync:${opts.vertical}] ${msg}`),
      error: (msg) => console.error(`[sync:${opts.vertical}] ${msg}`),
    }
  }

  async start(): Promise<void> {
    const recovered = await this.syncStore.resetRunning(this.vertical)
    if (recovered > 0) {
      this.logger.info(`Recovered ${recovered} interrupted sync job(s)`)
    }

    this.timer = setInterval(() => {
      void this.poll()
    }, this.pollIntervalMs)
    this.logger.info(
      `Sync worker started (poll=${this.pollIntervalMs}ms, concurrency=${this.maxConcurrency})`,
    )
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }

    for (const ac of this.abortControllers.values()) {
      ac.abort()
    }

    const deadline = Date.now() + 30_000
    while (this.inFlightJobs.size > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 200))
    }

    await this.syncStore.resetRunning(this.vertical)
    this.logger.info('Sync worker stopped')
  }

  private async poll(): Promise<void> {
    if (this.processing) return
    this.processing = true

    try {
      while (this.inFlightJobs.size < this.maxConcurrency) {
        // Claimed, not just found: `claimNext` flips the job to running only
        // if it is still pending, so a second replica polling the same store
        // cannot pick it up too. Connections still running here are skipped:
        // the database holds one ACTIVE job per connection
        // (idx_sync_jobs_one_active), but a cancelled job is no longer active
        // while its run carries on, so the database alone would let the
        // connection's next job start beside it.
        const job = await this.syncStore.claimNext(this.vertical, this.inFlightConnections)
        if (!job) break

        this.inFlightJobs.add(job.id)
        this.inFlightConnections.add(job.connectionId)
        const ac = new AbortController()
        this.abortControllers.set(job.id, ac)

        void this.processJob(job, ac.signal).finally(() => {
          this.inFlightJobs.delete(job.id)
          this.inFlightConnections.delete(job.connectionId)
          this.abortControllers.delete(job.id)
        })
      }
    } finally {
      this.processing = false
    }
  }

  private async processJob(job: SyncJob, signal: AbortSignal): Promise<void> {
    // `claimNext` has already marked a polled job running; a job handed in
    // directly (tests, tooling) has not.
    if (job.status !== 'running') await this.syncStore.markRunning(job.id)
    this.logger.info(`Sync job ${job.id} started for ${job.platform}`)

    const adapter = this.registry.get(job.platform)
    if (!adapter) {
      await this.syncStore.markFailed(job.id, `Unknown platform: ${job.platform}`)
      return
    }

    let credentials = await this.credentialStore.loadById(job.connectionId)
    if (!credentials) {
      await this.syncStore.markFailed(job.id, `No credentials for connection: ${job.connectionId}`)
      return
    }

    try {
      credentials = await this.tokenRefresher.ensureFresh(adapter, credentials, job.connectionId)
    } catch (err) {
      await this.syncStore.markFailed(job.id, `Token refresh failed: ${err}`)
      return
    }

    const breakerKey = job.connectionId
    // `peek`, not `isOpen`: this is a look-ahead, and the request that will
    // settle the circuit is made per collection below. `isOpen` here took the
    // half-open probe and made nothing of it, so every collection then saw a
    // probe in flight and threw — and no request ever released it. A tripped
    // connection stayed locked out until the process restarted.
    if (this.circuitBreaker.peek(breakerKey)) {
      await this.syncStore.markFailed(
        job.id,
        'Circuit breaker is open — platform temporarily unavailable',
      )
      return
    }

    const progress: Record<string, ResourceProgress> = {}
    for (const { resourceType, method } of this.listableResources) {
      const hasMethod =
        typeof (adapter as unknown as Record<string, unknown>)[method] === 'function'
      progress[resourceType] = {
        synced: 0,
        status: hasMethod ? 'pending' : 'skipped',
      }
      if (!hasMethod && this.unavailableReason) {
        // Best-effort: a declaration that cannot be read leaves the bare skip.
        try {
          const reason = await this.unavailableReason(job.platform, { resourceType, method })
          if (reason) progress[resourceType].error = `Not provided by ${job.platform}: ${reason}`
        } catch {
          // ignored — see SyncWorkerOptions.unavailableReason
        }
      }
    }
    await this.syncStore.updateProgress(job.id, progress)

    let hasError = false

    for (const { resourceType, method } of this.listableResources) {
      if (signal.aborted) break
      if (progress[resourceType].status === 'skipped') continue

      progress[resourceType].status = 'running'
      await this.syncStore.updateProgress(job.id, progress)

      try {
        await this.syncResourceType(
          adapter,
          credentials,
          resourceType,
          method,
          breakerKey,
          progress,
          job.id,
          job.connectionId,
          signal,
        )
        progress[resourceType].status = 'completed'
      } catch (err) {
        if (isRefusal(err) && progress[resourceType].synced === 0) {
          // The adapter refused before sending anything: its platform cannot
          // list this resource. Nothing to sync, and nothing failed — but no
          // cached rows of it may be served as the whole collection either.
          progress[resourceType].status = 'skipped'
          progress[resourceType].error = describeSyncError(err)
          await this.resourceStore.invalidateCollection(
            this.vertical,
            adapter.platform,
            job.connectionId,
            resourceType,
          )
          this.logger.info(`Sync job ${job.id}: ${resourceType} skipped: ${err}`)
        } else {
          progress[resourceType].status = 'failed'
          progress[resourceType].error = describeSyncError(err)
          hasError = true
          this.logger.warn(`Sync job ${job.id}: ${resourceType} failed: ${err}`)
        }
      }

      await this.syncStore.updateProgress(job.id, progress)
    }

    if (signal.aborted) return

    if (hasError) {
      await this.syncStore.markFailed(job.id, 'One or more resource types failed to sync', progress)
    } else {
      await this.syncStore.markCompleted(job.id, progress)
    }

    this.logger.info(`Sync job ${job.id} ${hasError ? 'failed' : 'completed'}`)

    if (this.onJobComplete) {
      try {
        const finalJob = (await this.syncStore.get(job.id)) ?? job
        await this.onJobComplete(finalJob, hasError ? 'failed' : 'completed')
      } catch (err) {
        this.logger.error(`onJobComplete hook failed for ${job.id}: ${err}`)
      }
    }

    if (job.callbackUrl) {
      const finalJob = await this.syncStore.get(job.id)
      if (finalJob) {
        void sendCallback(job.callbackUrl, finalJob, this.logger)
      }
    }
  }

  private async syncResourceType(
    adapter: TAdapter,
    credentials: Credentials,
    resourceType: string,
    method: string,
    breakerKey: string,
    progress: Record<string, ResourceProgress>,
    jobId: string,
    connectionId: string,
    signal: AbortSignal,
  ): Promise<void> {
    const listFn = (adapter as unknown as Record<string, unknown>)[method] as ListFn | undefined
    if (!listFn) return

    // One value for both the request and the short-page test below. They must
    // not diverge: asking for 500 while the platform caps at 100 makes every
    // full page look like the last one, so the sync would stop after a single
    // page AND mark the collection complete. See `maxPageSize` in
    // AdapterCapabilities. Read through the same function as the router's
    // parseListQuery, so the two paths agree on which declarations count.
    const declaredMax = declaredPageMax(adapter as PageMaxBearing)
    const pageSize =
      declaredMax === undefined ? this.pageSize : Math.min(this.pageSize, declaredMax)

    // The same fingerprint every reader filters on — see `normalizerVersion`.
    const normVersion = this.normalizerVersion?.(this.vertical, adapter.platform)

    let page = 1
    // ResourceStore is partitioned by connection_id (passed as the tenant_id column).
    const tenantId = connectionId
    // Ids of the previous non-empty page, to catch an adapter that ignores
    // `page` on its second request rather than its 10,000th.
    let previousPageIds: string | null = null

    // The sweep cutoff, taken BEFORE the first request. Every sync is a full
    // one and `upsertMany` re-stamps unchanged rows, so after a known end
    // every row the platform still returns is at least this new — and so is
    // any row another writer (a read-through, a write-through) stores while
    // this sync runs, which the sweep must leave alone. `stampedMin` covers a
    // wall clock stepping back mid-sync, which would otherwise put this sync's
    // own rows before the cutoff.
    //
    // Assumes ONE clock: every writer stamps from its own `Date.now()`, taken
    // before its write lands. A replica sharing a Postgres store whose clock
    // runs behind, or a write that waited on the pool across the start of
    // this sync, can stamp a live row before the cutoff; it is then removed
    // until the next read or sync fetches it again (docs/dev-api.md §7).
    const sweepBefore = Date.now()
    let stampedMin = Infinity
    let wrote = 0

    while (true) {
      if (signal.aborted) return
      if (this.circuitBreaker.isOpen(breakerKey)) {
        throw new Error('Circuit breaker opened during sync')
      }

      let items: Array<{ id: string }>
      // A sink on the params lets the adapter say whether more rows remain —
      // see `hasMore` in UpstreamPageMeta. Non-enumerable, so an adapter that
      // spreads params into a query string never sends it upstream.
      const params = withPageSink({ page, limit: pageSize })
      let reportedHasMore: boolean | undefined
      let askedSize = pageSize
      try {
        const fetched = (await listFn.call(adapter, credentials, params)) as Array<{ id: string }>
        reportedHasMore = readUpstreamPage(params)?.hasMore
        // A method whose endpoint takes fewer rows than pageSize reports the
        // size it sent; a full page at that size is not the last one.
        askedSize = effectivePageSize(params, pageSize)
        // Once, here: the cache write and the resource.synced bodies below both
        // read from this, and neither passes through the router helpers.
        items = stripRawPayloads(
          this.vertical,
          fetched,
          this.rawPayloadEnabled ? this.rawPayloadEnabled(this.vertical) : true,
        )
        this.circuitBreaker.recordSuccess(breakerKey)
      } catch (err) {
        // A refusal is made before any request: nothing reached the platform.
        if (!isRefusal(err)) this.circuitBreaker.recordFailure(breakerKey)
        throw err
      }

      if (items.length > 0) {
        // Two identical consecutive pages mean the adapter answered `page` N
        // with page N-1. Without this the only exit was `maxPagesPerResource`,
        // thousands of requests against the platform's rate limit later.
        const ids = items.map((i) => String(i.id)).join('\u0000')
        if (ids === previousPageIds) {
          throw new Error(
            `Sync of '${resourceType}' on ${adapter.platform} returned the same ${items.length} rows ` +
              `for page ${page} as for page ${page - 1}. The adapter is ignoring the \`page\` parameter.`,
          )
        }
        previousPageIds = ids

        const stampedAt = await this.resourceStore.upsertMany(
          this.vertical,
          adapter.platform,
          tenantId,
          resourceType,
          items,
          normVersion,
        )
        stampedMin = Math.min(stampedMin, stampedAt)
        wrote += items.length
        progress[resourceType].synced += items.length
        await this.syncStore.updateProgress(jobId, progress)
        await this.emitSyncEvents(adapter.platform, connectionId, resourceType, items)
      }

      // The adapter's word when it gave one; the short-page inference only when
      // it did not. The inference is wrong for lists that are not one upstream
      // page of their own rows, and costs an extra empty request on a
      // collection that is an exact multiple of the page size.
      const lastPage =
        typeof reportedHasMore === 'boolean' ? !reportedHasMore : items.length < askedSize
      if (lastPage) {
        // Recording a collection complete is what lets an unfiltered list be
        // served from cache at all — row presence alone never counts. So it is
        // recorded only when the END IS KNOWN: the adapter said so, or it
        // declared the page size its platform fills, which makes a short page
        // really the last. Otherwise the end is a guess — a platform capping
        // pages below `pageSize` makes the first page look like the last — and
        // vouching for it would serve a truncated collection as whole.
        //
        // A guessed end drops any marker a read left behind instead: this sync
        // has just rewritten the collection's rows, so the next list goes
        // upstream. (That is what every post-sync list did before rows were
        // versioned — by accident, via the unversioned marker write. Now on
        // purpose.)
        //
        // A known end that wrote NO rows is treated like a guessed one. Some
        // adapters turn a 403 or 404 into `[]`, so an empty answer proves
        // neither that the collection is empty (nothing is swept) nor that the
        // rows still cached are the collection (nothing is vouched for). A
        // marker would buy nothing over an empty cache — a hit needs a row —
        // and over a non-empty one it would serve rows this sync could not see
        // as whole and fresh.
        const endIsKnown =
          typeof reportedHasMore === 'boolean' || (declaredMax != null && declaredMax > 0)
        if (endIsKnown && wrote > 0) {
          // A known end is also what proves absence: a cached row this sync
          // did not re-stamp is one the platform no longer returns. Removed
          // before the marker is set, so the collection it vouches for holds
          // no ghosts, and a sweep that fails leaves no marker. A guessed end
          // proves nothing. Cache housekeeping, not news from the platform: no
          // event is emitted.
          //
          // The proof is only as good as the end: a declared `maxPageSize`
          // makes ANY short page the end, so a list method whose page is not
          // one upstream page of its own rows must report `hasMore` itself
          // (see `maxPageSize` in AdapterCapabilities).
          const removed = await this.resourceStore.sweepCollection(
            this.vertical,
            adapter.platform,
            tenantId,
            resourceType,
            Math.min(sweepBefore, stampedMin),
          )
          if (removed.length > 0) {
            this.logger.info(
              `Sync job ${jobId}: removed ${removed.length} cached ${resourceType} no longer upstream`,
            )
          }
          await this.resourceStore.markCollectionComplete(
            this.vertical,
            adapter.platform,
            tenantId,
            resourceType,
            normVersion,
          )
        } else {
          await this.resourceStore.invalidateCollection(
            this.vertical,
            adapter.platform,
            tenantId,
            resourceType,
          )
        }
        break
      }
      page++

      // Bounded failure beats an invisible infinite loop. An adapter that
      // ignores `page` would otherwise spin here forever, re-writing the same
      // rows, holding the job in `running` with no error and no end — the
      // same undiagnosable shape as a hung request.
      if (page > this.maxPagesPerResource) {
        throw new Error(
          `Sync of '${resourceType}' on ${adapter.platform} exceeded ${this.maxPagesPerResource} ` +
            'pages without reaching a short page. The adapter is most likely ignoring the ' +
            '`page` parameter and returning the same rows for every page.',
        )
      }
    }
  }

  /** External mode: fire `resource.synced` events through the existing
   *  webhook delivery system. No-op when external hooks are unset. */
  private async emitSyncEvents(
    platform: string,
    connectionId: string,
    resourceType: string,
    items: Array<{ id: string }>,
  ): Promise<void> {
    if (!this.external) return
    const tenantId = await this.resolveOwnerTenant(connectionId)
    if (!tenantId) return
    const fetchedAt = Date.now()
    const subs = this.external.webhookSubs
    const deliveries = this.external.webhookDeliveries

    if (this.batchEvents) {
      await emitTenantEvent(
        subs,
        tenantId,
        'resource.synced',
        {
          vertical: this.vertical,
          platform,
          connection_id: connectionId,
          resource_type: resourceType,
          fetched_at: fetchedAt,
          op: 'upsert' as const,
          items,
        },
        { deliveries },
      )
      return
    }

    for (const item of items) {
      await emitTenantEvent(
        subs,
        tenantId,
        'resource.synced',
        {
          vertical: this.vertical,
          platform,
          connection_id: connectionId,
          resource_type: resourceType,
          resource_id: item.id,
          data: item,
          fetched_at: fetchedAt,
          op: 'upsert' as const,
        },
        { deliveries },
      )
    }
  }

  private async resolveOwnerTenant(connectionId: string): Promise<string | null> {
    if (this.external?.resolveTenantId) {
      return this.external.resolveTenantId(connectionId)
    }
    const row = await this.credentialStore.getRow(connectionId)
    return row?.ownerTenantId ?? row?.tenantId ?? null
  }
}

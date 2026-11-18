/**
 * Retry worker for outbound webhook deliveries.
 *
 * Polls `WebhookDeliveryStore.nextBatch()` on an interval, POSTs each
 * pending row that has elapsed its `next_attempt_at`, and updates the
 * store with the result. Failures are scheduled for retry per
 * `RETRY_DELAYS`; after `MAX_ATTEMPTS` the row moves to `dead` and
 * stays visible until manually replayed.
 */
import type { WebhookDeliveryStore } from '../auth/webhook-deliveries'
import type { WebhookSubscriptionStore } from '../auth/webhook-subscriptions'
import { safeFetch } from '../net/safe-fetch'
import { deliverOne } from './event-emitter'

export interface WebhookRetryWorkerOptions {
  deliveries: WebhookDeliveryStore
  /** Optional — when present, success/failure is mirrored to the subscription's last_* fields. */
  subscriptions?: WebhookSubscriptionStore
  /** Polling interval in ms. Default 5s. */
  intervalMs?: number
  /** Max rows per tick. Default 50. */
  batchSize?: number
  /** Per-attempt timeout in ms. Default 5s. */
  timeoutMs?: number
  /** Custom fetch (tests). Defaults to globalThis.fetch. */
  fetchImpl?: typeof fetch
  /** Optional structured logger. */
  logger?: { warn: (...args: unknown[]) => void; info?: (...args: unknown[]) => void }
  /**
   * Optional retention sweep, run piggyback on this worker's interval at
   * most every 6h. Days are read live (runtime settings); 0 or negative
   * means keep forever (the default).
   */
  retention?: {
    /** Live read of `webhooks.delivery_retention_days`. */
    deliveryDays: () => number
    /** Raw inbound platform payloads, when the store is wired. */
    inboundEvents?: { deleteOlderThan(cutoff: number): Promise<number> }
    /** Live read of `webhooks.inbound_event_retention_days`. */
    inboundDays?: () => number
  }
}

const RETENTION_SWEEP_INTERVAL_MS = 6 * 3_600_000

export class WebhookRetryWorker {
  private timer: ReturnType<typeof setInterval> | null = null
  private inFlight = false
  private lastRetentionSweep = 0

  constructor(private readonly opts: WebhookRetryWorkerOptions) {}

  /** Prune old delivery bodies / inbound payloads per the live settings. */
  async sweepRetention(now: number = Date.now()): Promise<{ deliveries: number; inbound: number }> {
    const out = { deliveries: 0, inbound: 0 }
    const retention = this.opts.retention
    if (!retention) return out
    const deliveryDays = retention.deliveryDays()
    if (deliveryDays > 0) {
      out.deliveries = await this.opts.deliveries.deleteOlderThan(now - deliveryDays * 86_400_000)
    }
    const inboundDays = retention.inboundDays?.() ?? 0
    if (inboundDays > 0 && retention.inboundEvents) {
      out.inbound = await retention.inboundEvents.deleteOlderThan(now - inboundDays * 86_400_000)
    }
    if (out.deliveries > 0 || out.inbound > 0) {
      this.opts.logger?.info?.(
        { deliveries: out.deliveries, inbound: out.inbound },
        'webhook retention sweep',
      )
    }
    return out
  }

  start(): void {
    if (this.timer) return
    const interval = this.opts.intervalMs ?? 5_000
    this.timer = setInterval(() => {
      void this.tick()
    }, interval)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  /** Run a single drain pass. Exposed so tests don't have to wait on intervals. */
  async tick(): Promise<number> {
    if (this.inFlight) return 0
    this.inFlight = true
    try {
      const now = Date.now()
      if (this.opts.retention && now - this.lastRetentionSweep > RETENTION_SWEEP_INTERVAL_MS) {
        this.lastRetentionSweep = now
        await this.sweepRetention(now).catch((err) =>
          this.opts.logger?.warn({ err }, 'webhook retention sweep failed'),
        )
      }
      const batch = await this.opts.deliveries.nextBatch(this.opts.batchSize ?? 50)
      // Default to safeFetch so tenant-controlled delivery URLs cannot
      // probe internal services; tests can still pass a stub via opts.
      const fetchImpl = this.opts.fetchImpl ?? safeFetch
      const timeoutMs = this.opts.timeoutMs ?? 5_000

      let processed = 0
      await Promise.allSettled(
        batch.map(async (d) => {
          processed += 1
          try {
            // Headers are read live per attempt rather than replayed off the
            // delivery row: a delivery is enqueued once and retried for hours,
            // so a credential rotated in between must take effect on the next
            // attempt. The body and signature stay exactly as enqueued.
            const headers = (await this.opts.subscriptions?.headersFor(d.subscriptionId)) ?? null
            const status = await deliverOne({
              fetchImpl,
              url: d.url,
              body: d.body,
              signature: d.signature,
              event: d.eventType,
              eventId: d.eventId,
              timeoutMs,
              headers,
            })
            if (status >= 200 && status < 300) {
              this.opts.deliveries.markDelivered(d.id, status)
              this.opts.subscriptions?.recordResult(d.subscriptionId, { status })
            } else {
              this.opts.deliveries.markFailed(d.id, { status, error: `HTTP ${status}` })
              this.opts.subscriptions?.recordResult(d.subscriptionId, {
                status,
                error: `HTTP ${status}`,
              })
            }
          } catch (err) {
            const message = err instanceof Error ? err.message.slice(0, 240) : String(err)
            this.opts.deliveries.markFailed(d.id, { status: null, error: message })
            this.opts.subscriptions?.recordResult(d.subscriptionId, {
              status: null,
              error: message,
            })
            this.opts.logger?.warn?.({ id: d.id, err: message }, 'webhook delivery failed')
          }
        }),
      )
      return processed
    } finally {
      this.inFlight = false
    }
  }
}

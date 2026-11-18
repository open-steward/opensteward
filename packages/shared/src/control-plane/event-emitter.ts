/**
 * Outbound webhook delivery for tenant-scoped events.
 *
 * `emitTenantEvent` looks up every subscription on the given tenant whose
 * `events` list matches `event`, signs an HMAC-SHA256 of the JSON body
 * with the per-subscription secret, and dispatches it.
 *
 * Two-tier delivery:
 *   1. **Inline best-effort**: tries one immediate POST so the happy
 *      path is fast (no worker latency).
 *   2. **Durable queue**: when a `WebhookDeliveryStore` is provided, every
 *      attempt also lives in `webhook_deliveries`. Failures schedule a
 *      retry; successful inline deliveries are recorded as `delivered`.
 *
 * If the store is omitted, delivery is fire-and-forget: one inline
 * attempt, no retries.
 */
import { createHmac, randomUUID } from 'crypto'
import type { WebhookSubscriptionStore } from '../auth/webhook-subscriptions'
import type { WebhookDeliveryStore } from '../auth/webhook-deliveries'
import { safeFetch } from '../net/safe-fetch'
import { renderPayload, type RenderContext } from './webhook-formats'

export type TenantEvent =
  | 'customer.created'
  | 'customer.updated'
  | 'customer.deleted'
  | 'connect_link.created'
  | 'connect_link.consumed'
  | 'connect_link.disposed'
  | 'connection.authorization_expired'
  | 'connection.platform_credentials_invalid'
  | 'resource.synced'
  | 'resource.updated'
  | 'resource.deleted'
  | 'platform.event'

/** Body shape for the `connect_link.disposed` event. Fired when a one-time
 *  Connect Link's post-OAuth sync completes successfully and the resulting
 *  connection is auto-deleted. The developer can use this signal to know
 *  the snapshot is final and the connection no longer exists upstream. */
export interface ConnectLinkDisposedBody {
  connection_id: string
  vertical: string
  platform: string
  session_id: string
  disposed_at: number
}

/** Body shape for the `connection.authorization_expired` event. Fired when
 *  a refresh attempt (either on-request or scheduled keep-alive) fails with
 *  `invalid_grant` / `unauthorized_client` — the customer must re-authorize. */
export interface ConnectionAuthorizationExpiredBody {
  connection_id: string
  vertical: string
  platform: string
  tenant_id: string | null
  owner_tenant_id: string | null
  label: string | null
  failed_at: number
}

/** Body shape for the `connection.platform_credentials_invalid` event. Fired
 *  when a refresh fails with `invalid_client` — the platform's OAuth client
 *  credentials (client id/secret the operator configured) were rejected. This
 *  affects every connection for that platform; the OPERATOR must fix the
 *  client credentials. Customer re-authorization will NOT resolve it. Shares
 *  the shape of `connection.authorization_expired` so subscribers can handle
 *  both with one parser, switching on the event type. */
export interface ConnectionPlatformCredentialsInvalidBody {
  connection_id: string
  vertical: string
  platform: string
  tenant_id: string | null
  owner_tenant_id: string | null
  label: string | null
  failed_at: number
}

/** Body shape for `resource.*` events fired by the data-store layer. */
export interface ResourceEventBody {
  vertical: string
  platform: string
  connection_id: string
  resource_type: string
  resource_id: string
  data?: unknown
  fetched_at: number
  op: 'upsert' | 'delete'
}

/** Body shape for the `platform.event` event. Fired when a VERIFIED inbound
 *  webhook from a third-party platform (Stripe `charge.succeeded`, Shopify
 *  `orders/create`, …) is routed to the owning connection. Distinct from
 *  `resource.*` (which mean "OpenSteward fetched/changed a row") — this means
 *  "the platform notified us". A subsequent cache refresh may additionally
 *  fire `resource.updated`/`resource.deleted`. */
export interface PlatformEventBody {
  vertical: string
  platform: string
  connection_id: string
  /** Platform-native event type, e.g. `charge.succeeded`. */
  event_type: string
  /** Canonical resource slug, e.g. `charges` | `unknown`. */
  resource_type: string
  /** Canonical action, e.g. `succeeded` | `created` | `unknown`. */
  action: string
  /** Platform resource id; may be `''` when the payload lacked one. */
  resource_id: string
  /** Raw verified platform payload. */
  payload: unknown
  received_at: number
}

export interface EventEnvelope<T = unknown> {
  id: string
  /** Envelope schema version. Bumped only on breaking shape changes so
   *  receivers can branch. Starts at 1. */
  version: number
  type: TenantEvent
  created_at: number
  data: T
}

/** Current outbound envelope schema version. */
export const EVENT_ENVELOPE_VERSION = 1

const DELIVERY_TIMEOUT_MS = 5_000

/** HMAC-SHA256 of the rendered body, hex. Shared with the test-send route
 *  so a test event is signed exactly like a real delivery. */
export function signBody(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('hex')
}

export interface EmitOptions {
  /** Override the 5s per-delivery timeout (test hook). */
  timeoutMs?: number
  /** Custom fetch impl (test hook). Defaults to globalThis.fetch. */
  fetchImpl?: typeof fetch
  /** When supplied, failures get queued for retry in this store. */
  deliveries?: WebhookDeliveryStore
  /**
   * When `false`, skip the inline POST and only enqueue. Used by tests
   * that want deterministic worker-driven delivery.
   */
  inlineAttempt?: boolean
  /**
   * Turns a platform slug into a display name for the human-readable
   * formats. Injected because the platform catalogue lives in
   * integration-server, which this package cannot import.
   */
  resolvePlatformName?: RenderContext['resolvePlatformName']
}

/**
 * Fire-and-forget — returns immediately, deliveries finish in the
 * background. Returns the envelope so callers can log it. When a
 * `WebhookDeliveryStore` is supplied, every delivery is durably tracked
 * so failed inline attempts get retried by the worker.
 */
export async function emitTenantEvent<T>(
  subs: WebhookSubscriptionStore,
  tenantId: string,
  type: TenantEvent,
  data: T,
  opts: EmitOptions = {},
): Promise<EventEnvelope<T>> {
  const envelope: EventEnvelope<T> = {
    id: randomUUID(),
    version: EVENT_ENVELOPE_VERSION,
    type,
    created_at: Date.now(),
    data,
  }
  const matches = await subs.matching(tenantId, type)
  if (matches.length === 0) return envelope

  // The body is rendered per subscription, not once for all of them: each
  // subscription chooses its own destination format, and the signature has to
  // cover the bytes that particular receiver will actually see.
  const renderCtx: RenderContext = { resolvePlatformName: opts.resolvePlatformName }
  // Default to safeFetch so tenant-supplied subscription URLs cannot
  // be used to probe internal services. Callers can override
  // (e.g. tests) via opts.fetchImpl.
  const fetchImpl = opts.fetchImpl ?? safeFetch
  const timeoutMs = opts.timeoutMs ?? DELIVERY_TIMEOUT_MS
  const deliveries = opts.deliveries
  const inline = opts.inlineAttempt !== false

  for (const sub of matches) {
    const body = renderPayload(sub.format, envelope, renderCtx)
    const signature = signBody(body, sub.secret)

    // Always durably enqueue first when the store is wired, so a crash
    // mid-attempt doesn't lose the event.
    const delivery = await deliveries?.enqueue({
      subscriptionId: sub.id,
      eventId: envelope.id,
      eventType: type,
      url: sub.url,
      body,
      signature,
    })

    if (!inline) continue

    void deliverOne({
      fetchImpl,
      url: sub.url,
      body,
      signature,
      event: type,
      eventId: envelope.id,
      timeoutMs,
      headers: sub.headers ?? null,
    })
      .then(async (status) => {
        await subs.recordResult(sub.id, { status })
        if (delivery && status >= 200 && status < 300) {
          await deliveries?.markDelivered(delivery.id, status)
        } else if (delivery) {
          await deliveries?.markFailed(delivery.id, { status, error: `HTTP ${status}` })
        }
      })
      .catch(async (err: Error) => {
        const message = err.message.slice(0, 240)
        await subs.recordResult(sub.id, { status: null, error: message })
        if (delivery) await deliveries?.markFailed(delivery.id, { status: null, error: message })
      })
      // Terminal guard: the recording writes above are best-effort. If they
      // themselves reject — e.g. the store handle was closed while this
      // fire-and-forget delivery was still in flight (process shutdown, or a
      // test closing its DbHandle) — swallow it so it never surfaces as an
      // unhandled rejection. The durable enqueue already persisted the event;
      // the retry worker reconciles any unrecorded delivery.
      .catch(() => {})
  }
  return envelope
}

export interface DeliverOneOptions {
  fetchImpl: typeof fetch
  url: string
  body: string
  signature: string
  event: string
  eventId: string
  timeoutMs: number
  /**
   * Custom headers from the subscription. Merged UNDER the built-in headers,
   * so a stored `x-oi-signature` can never displace the one computed here —
   * `validateHeaders()` rejects those names at the API boundary, and this
   * ordering is the second line of defence behind it.
   */
  headers?: Record<string, string> | null
}

export async function deliverOne(opts: DeliverOneOptions): Promise<number> {
  const { fetchImpl, url, body, signature, event, eventId, timeoutMs } = opts
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        ...(opts.headers ?? {}),
        'content-type': 'application/json',
        'x-oi-event': event,
        'x-oi-event-id': eventId,
        'x-oi-signature': `sha256=${signature}`,
        'user-agent': 'opensteward-webhooks/1',
      },
      body,
      signal: ctrl.signal,
    })
    return res.status
  } finally {
    clearTimeout(timer)
  }
}

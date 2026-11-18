/**
 * Synthetic test delivery for one webhook subscription — shared by the
 * admin router and the developer-facing router so "does this destination
 * work?" behaves identically from both surfaces.
 *
 * Deliberately synchronous and deliberately NOT queued: the result is the
 * whole point, and a diagnostic must neither pollute the delivery record of
 * real events nor be picked up and retried by the worker when the receiver
 * rejects it. A rejection is reported as a result — the answer to "does this
 * work?" is no, which is not an error in this API.
 */
import { randomUUID } from 'crypto'
import type { WebhookSubscriptionStore } from '../auth/webhook-subscriptions'
import type { TenantEvent } from './event-emitter'
import { EVENT_ENVELOPE_VERSION, deliverOne, signBody } from './event-emitter'
import { TEST_EVENT_TYPE, renderPayload } from './webhook-formats'
import { safeFetch } from '../net/safe-fetch'

export interface TestSendDeps {
  subs: WebhookSubscriptionStore
  /** Defaults to `safeFetch`, so a test send is SSRF-guarded too. */
  fetchImpl?: typeof fetch
  /** Resolves a platform slug to a display name for the readable formats. */
  resolvePlatformName?: (slug: string) => string | undefined
}

export interface TestSendResult {
  id: string
  ok: boolean
  status: number | null
  format: string
  /** Synthetic and secret-free, so echoing it shows exactly what was sent. */
  sentBody?: string
  error?: string
}

/** Returns null when the subscription does not exist. */
export async function sendSyntheticTest(
  deps: TestSendDeps,
  subscriptionId: string,
): Promise<TestSendResult | null> {
  const sub = await deps.subs.getWithSecret(subscriptionId)
  if (!sub) return null

  const envelope = {
    id: randomUUID(),
    version: EVENT_ENVELOPE_VERSION,
    type: TEST_EVENT_TYPE as TenantEvent,
    created_at: Date.now(),
    data: {
      subscription_id: sub.id,
      format: sub.format,
      sent_at: Date.now(),
    },
  }
  const body = renderPayload(sub.format, envelope, {
    resolvePlatformName: deps.resolvePlatformName,
  })

  try {
    const status = await deliverOne({
      fetchImpl: deps.fetchImpl ?? safeFetch,
      url: sub.url,
      body,
      signature: signBody(body, sub.secret),
      event: TEST_EVENT_TYPE,
      eventId: envelope.id,
      timeoutMs: 5_000,
      headers: sub.headers,
    })
    return {
      id: sub.id,
      ok: status >= 200 && status < 300,
      status,
      format: sub.format,
      sentBody: body,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 240) : 'delivery failed'
    return { id: sub.id, ok: false, status: null, error: message, format: sub.format }
  }
}

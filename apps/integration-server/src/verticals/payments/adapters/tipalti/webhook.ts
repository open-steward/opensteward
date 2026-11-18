/**
 * Tipalti webhook verification + parsing.
 *
 * Tipalti signs each delivery with HMAC-SHA256 over `${timestamp}.${rawBody}`,
 * keyed on the webhook signing secret. The signature ships in the
 * `Tipalti-Signature` header as `t=<unix-ts>,v1=<hex>`. During
 * a key-rotation grace period the header may carry two `v1=` values — one per
 * key — so we accept the body if it matches any of them. A 5-minute timestamp
 * tolerance guards against replay.
 *
 * The event envelope is `{ id, type, createdDate, isTest, version, traceId,
 * eventData }`; `type` is a camelCase event name (e.g. `paymentCompleted`).
 *
 * Docs: https://documentation.tipalti.com/docs/overview-1
 *       https://documentation.tipalti.com/docs/event-types
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

const TOLERANCE_SECONDS = 5 * 60

/** Map a Tipalti event `type` onto a canonical resource + action. */
const EVENT_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  paymentsubmitted: { resourceType: 'charges', action: 'created' },
  paymentcompleted: { resourceType: 'charges', action: 'paid' },
  paymentcanceled: { resourceType: 'charges', action: 'cancelled' },
  paymenterror: { resourceType: 'charges', action: 'failed' },
  paymentdeferred: { resourceType: 'charges', action: 'updated' },
  paymentfeescollected: { resourceType: 'charges', action: 'updated' },
  paymentgroupapproved: { resourceType: 'payouts', action: 'updated' },
  paymentgroupdeclined: { resourceType: 'payouts', action: 'cancelled' },
  payerdepositcompleted: { resourceType: 'balance_transactions', action: 'created' },
  billupdated: { resourceType: 'invoices', action: 'updated' },
  syncpayeeinvoices: { resourceType: 'invoices', action: 'updated' },
  payeedetailschanged: { resourceType: 'customers', action: 'updated' },
  payeeregistrationscreeningstatus: { resourceType: 'customers', action: 'updated' },
  payeerequestedcompliancedocument: { resourceType: 'customers', action: 'updated' },
  payeecompliancedocumentrequestclosed: { resourceType: 'customers', action: 'updated' },
}

function classify(eventType: string): {
  resourceType: WebhookResourceType
  action: WebhookAction
} {
  return EVENT_MAP[eventType.toLowerCase()] ?? { resourceType: 'unknown', action: 'unknown' }
}

function parseSignatureHeader(value: string): { timestamp?: string; signatures: string[] } {
  const signatures: string[] = []
  let timestamp: string | undefined
  for (const part of value.split(',')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    const key = part.slice(0, idx).trim()
    const val = part.slice(idx + 1).trim()
    if (key === 't') timestamp = val
    else if (key === 'v1') signatures.push(val)
  }
  return { timestamp, signatures }
}

function hexEquals(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, 'hex')
    const bufB = Buffer.from(b, 'hex')
    if (bufA.length === 0 || bufA.length !== bufB.length) return false
    return timingSafeEqual(bufA, bufB)
  } catch {
    return false
  }
}

export function verifyTipaltiWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    if (!secret) return false
    const header = headers['tipalti-signature'] ?? headers['Tipalti-Signature']
    if (!header) return false

    const { timestamp, signatures } = parseSignatureHeader(header)
    if (!timestamp || signatures.length === 0) return false

    // Replay guard: reject signatures older than the tolerance window.
    const ts = Number(timestamp)
    if (!Number.isFinite(ts)) return false
    const skew = Math.abs(Date.now() / 1000 - ts)
    if (skew > TOLERANCE_SECONDS) return false

    const signedMessage = `${timestamp}.${payload.toString('utf8')}`
    const expected = createHmac('sha256', secret).update(signedMessage).digest('hex')

    return signatures.some((sig) => hexEquals(sig, expected))
  } catch {
    return false
  }
}

export function parseTipaltiWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const eventType = String(payload['type'] ?? '')
  const eventData = (payload['eventData'] as Record<string, unknown> | undefined) ?? {}
  const resourceId = String(
    eventData['id'] ??
      eventData['paymentRefCode'] ??
      eventData['payeeId'] ??
      eventData['invoiceRefCode'] ??
      eventData['refCode'] ??
      payload['id'] ??
      '',
  )
  const { resourceType, action } = classify(eventType)
  return [
    {
      id: payload['id'] ? String(payload['id']) : undefined,
      platform: 'tipalti',
      type: eventType,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const TipaltiWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyTipaltiWebhook,
  parseWebhookEvents: parseTipaltiWebhookEvents,
}

/**
 * CoinPayments v2 webhook authentication.
 *
 * CoinPayments signs every webhook with the *same* HMAC recipe its outbound API
 * requests use (the signing math in reverse). The Base64 signature ships in the
 * `X-CoinPayments-Signature` header, alongside the `X-CoinPayments-Client`
 * (client ID) and `X-CoinPayments-Timestamp` (UTC ISO-8601) headers. The
 * canonical string concatenates, with NO separators:
 *
 *   BOM(U+FEFF) + HTTP_METHOD(POST) + fullWebhookUrl + clientId + timestamp + rawBody
 *
 * keyed by the integration's **client secret** (the same value used for API
 * auth — passed in as `secret`). We reconstruct `fullWebhookUrl` from the
 * inbound request headers (`x-coinpayments-webhook-url` when the gateway echoes
 * it, otherwise `proto://host/path`), then compare in constant time.
 *
 * Docs: https://docs.coinpayments.net/api/webhooks/authenticating-requests
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'
import { SIGNATURE_BOM } from './constants'

/** CoinPayments webhook notification head → canonical resource type. */
const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  invoice: 'charges',
  invoicecreated: 'charges',
  invoicepending: 'charges',
  invoicepaid: 'charges',
  invoicecompleted: 'charges',
  invoicecancelled: 'charges',
  invoicetimedout: 'charges',
  withdrawal: 'payouts',
  spend: 'payouts',
  deposit: 'balance_transactions',
}

/** CoinPayments invoice/withdrawal status → canonical webhook action. */
const ACTION_MAP: Record<string, WebhookAction> = {
  created: 'created',
  draft: 'created',
  scheduled: 'created',
  unpaid: 'created',
  pending: 'created',
  paid: 'paid',
  completed: 'succeeded',
  complete: 'succeeded',
  confirmed: 'succeeded',
  cancelled: 'cancelled',
  canceled: 'cancelled',
  deleted: 'deleted',
  timedout: 'failed',
  timed_out: 'failed',
  expired: 'failed',
  failed: 'failed',
}

/**
 * Compute the Base64 webhook signature for a raw body + signing inputs.
 *
 * Exported so the signing recipe can be unit-tested without a live delivery.
 */
export function buildWebhookSignature(
  clientSecret: string,
  url: string,
  clientId: string,
  timestamp: string,
  rawBody: Buffer | string,
  method = 'POST',
): string {
  const head = SIGNATURE_BOM + method.toUpperCase() + url + clientId + timestamp
  const hmac = createHmac('sha256', clientSecret)
  hmac.update(head, 'utf8')
  hmac.update(typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody)
  return hmac.digest('base64')
}

/** Best-effort reconstruction of the full webhook URL from inbound headers. */
function webhookUrlFromHeaders(headers: Record<string, string>): string | undefined {
  const echoed = headers['x-coinpayments-webhook-url'] ?? headers['X-CoinPayments-Webhook-Url']
  if (echoed) return echoed
  const host = headers['host'] ?? headers['x-forwarded-host']
  if (!host) return undefined
  const proto = headers['x-forwarded-proto'] ?? 'https'
  const path = headers['x-original-uri'] ?? headers['x-forwarded-uri'] ?? ''
  return `${proto}://${host}${path}`
}

export function verifyCoinpaymentsWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const sig = headers['x-coinpayments-signature'] ?? headers['X-CoinPayments-Signature']
    const clientId = headers['x-coinpayments-client'] ?? headers['X-CoinPayments-Client']
    const timestamp = headers['x-coinpayments-timestamp'] ?? headers['X-CoinPayments-Timestamp']
    const url = webhookUrlFromHeaders(headers)
    if (!sig || !secret || !clientId || !timestamp || !url) return false
    const expected = buildWebhookSignature(secret, url, clientId, timestamp, payload)
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

function classify(notificationType: string, status: string): {
  resourceType: WebhookResourceType
  action: WebhookAction
} {
  const head = notificationType.toLowerCase().replace(/[._-]/g, '')
  return {
    resourceType: RESOURCE_MAP[head] ?? 'unknown',
    action: ACTION_MAP[status.toLowerCase()] ?? ACTION_MAP[head] ?? 'unknown',
  }
}

export function parseCoinpaymentsWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const notificationType = String(
    payload['type'] ?? payload['notificationType'] ?? payload['event'] ?? '',
  )
  const invoice = (payload['invoice'] as Record<string, unknown> | undefined) ?? {}
  const status = String(payload['state'] ?? payload['status'] ?? invoice['status'] ?? '')
  const resourceId = String(
    invoice['invoiceId'] ?? invoice['id'] ?? payload['invoiceId'] ?? payload['id'] ?? '',
  )
  const { resourceType, action } = classify(notificationType, status)
  return [
    {
      id: payload['id'] != null ? String(payload['id']) : undefined,
      platform: 'coinpayments',
      type: notificationType,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const CoinpaymentsWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyCoinpaymentsWebhook,
  parseWebhookEvents: parseCoinpaymentsWebhookEvents,
}

/**
 * 2C2P backend notification (server-to-server webhook).
 *
 * The notification body is the same JWS envelope every REST call uses:
 *   { "payload": "<compact JWS, HS256, signed with the merchant Secret Key>" }
 * Authenticity is the signature itself — there is NO separate signature header.
 * We verify by re-checking the JWS HS256 signature against the merchant secret,
 * then decode the claims (respCode, invoiceNo, …) to classify the event.
 *
 * Docs: https://developer.2c2p.com/docs/api-payment-response-backend
 */
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookEvent, WebhookAction } from '../../schema/webhook'
import { decodeJwtClaims, verifyJwtHs256 } from './jwt'
import { mapStatus } from './transform/charge'

/** Pull the `payload` JWS out of a raw notification body (Buffer or object). */
function extractToken(input: Buffer | Record<string, unknown>): string | undefined {
  try {
    const obj =
      Buffer.isBuffer(input)
        ? (JSON.parse(input.toString('utf8')) as Record<string, unknown>)
        : input
    const token = obj?.['payload']
    return typeof token === 'string' ? token : undefined
  } catch {
    return undefined
  }
}

/**
 * Verify a 2C2P backend notification. The signed object lives in the `payload`
 * JWS; we re-derive the HS256 signature from the merchant secret. `secret` is
 * the merchant Secret Key (the same value used as `accessToken`).
 */
export function verifyTwoC2PWebhook(
  payload: Buffer,
  _headers: Record<string, string>,
  secret: string,
): boolean {
  const token = extractToken(payload)
  if (!token) return false
  return verifyJwtHs256(token, secret)
}

/** Map a 2C2P response code to a canonical webhook action. */
function actionForCode(respCode: string | undefined): WebhookAction {
  switch (mapStatus(respCode)) {
    case 'succeeded':
      return 'paid'
    case 'failed':
      return 'failed'
    case 'cancelled':
      return 'cancelled'
    case 'pending':
      return 'created'
    default:
      return 'unknown'
  }
}

export function parseTwoC2PWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  // The verified envelope carries the signed JWS in `payload`; decode its
  // claims. If a caller hands us already-decoded claims, fall back to those.
  const token = payload['payload']
  const claims =
    typeof token === 'string' ? decodeJwtClaims(token) : (payload as Record<string, unknown>)

  const respCode = typeof claims['respCode'] === 'string' ? (claims['respCode'] as string) : undefined
  const resourceId = String(claims['invoiceNo'] ?? claims['tranRef'] ?? claims['referenceNo'] ?? '')

  return [
    {
      platform: '2c2p',
      type: `payment.${respCode ?? 'unknown'}`,
      resourceType: 'charges',
      action: actionForCode(respCode),
      resourceId,
      payload,
    },
  ]
}

export const TwoC2PWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyTwoC2PWebhook,
  parseWebhookEvents: parseTwoC2PWebhookEvents,
}

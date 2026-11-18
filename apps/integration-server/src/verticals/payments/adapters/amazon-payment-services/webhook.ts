/**
 * Amazon Payment Services (APS / PayFort) "Direct" / feedback notifications.
 *
 * APS does not push classic JSON webhook events. Instead it POSTs the same
 * flat parameter map it returns on the redirect response to the merchant's
 * configured Direct Transaction Feedback URL. Authenticity is proven by the
 * `signature` field in that body, computed by APS over the sorted parameters
 * wrapped in the merchant's SHA RESPONSE phrase (the same response phrase the
 * adapter stores as `Credentials.accessToken`, handed here as `secret`).
 *
 * There is no `x-…-signature` header — the signature is a body field — so
 * `verifyWebhook` parses the raw body, recomputes the signature with the
 * response phrase, and compares in constant time.
 *
 * Docs:
 *   https://paymentservices.amazon.com/docs/api
 *   https://docs.payfort.com/docs/in-common/build/index.html
 */
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'
import { verifySignature, type ShaType } from './signature'
import { DEFAULT_SHA_TYPE } from './constants'

/** 2-digit transaction status → canonical (resourceType, action). */
const STATUS_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  '02': { resourceType: 'charges', action: 'succeeded' }, // authorization success
  '14': { resourceType: 'charges', action: 'succeeded' }, // purchase success
  '04': { resourceType: 'charges', action: 'paid' }, // capture success
  '08': { resourceType: 'charges', action: 'cancelled' }, // authorization voided
  '06': { resourceType: 'refunds', action: 'refunded' }, // refund success
}

function classify(status: string, command: string): {
  resourceType: WebhookResourceType
  action: WebhookAction
} {
  const mapped = STATUS_MAP[status]
  if (mapped) return mapped
  // Fall back to the command verb when the status is an intermediate code.
  const cmd = command.toUpperCase()
  if (cmd === 'REFUND') return { resourceType: 'refunds', action: 'unknown' }
  if (cmd === 'VOID_AUTHORIZATION') return { resourceType: 'charges', action: 'cancelled' }
  if (cmd === 'CAPTURE') return { resourceType: 'charges', action: 'paid' }
  if (cmd === 'PURCHASE' || cmd === 'AUTHORIZATION') {
    return { resourceType: 'charges', action: 'failed' }
  }
  return { resourceType: 'unknown', action: 'unknown' }
}

/**
 * Verify a feedback notification by recomputing its SHA signature.
 *
 * `secret` is the merchant's SHA RESPONSE phrase; the SHA type defaults to the
 * account default and may be overridden via the `x-aps-sha-type` header for
 * merchants configured for SHA-512.
 */
export function verifyAmazonPaymentServicesWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    if (!secret) return false
    const params = JSON.parse(payload.toString('utf8')) as Record<string, unknown>
    const headerSha = (headers['x-aps-sha-type'] ?? headers['X-APS-SHA-Type'] ?? '').toLowerCase()
    const shaType: ShaType = headerSha === 'sha512' ? 'sha512' : DEFAULT_SHA_TYPE
    return verifySignature(params, secret, shaType)
  } catch {
    return false
  }
}

export function parseAmazonPaymentServicesWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const status = String(payload['status'] ?? '')
  const command = String(payload['command'] ?? payload['service_command'] ?? '')
  const resourceId = String(payload['fort_id'] ?? payload['merchant_reference'] ?? '')
  const { resourceType, action } = classify(status, command)
  return [
    {
      platform: 'amazon-payment-services',
      type: command || status || 'unknown',
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const AmazonPaymentServicesWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyAmazonPaymentServicesWebhook,
  parseWebhookEvents: parseAmazonPaymentServicesWebhookEvents,
}

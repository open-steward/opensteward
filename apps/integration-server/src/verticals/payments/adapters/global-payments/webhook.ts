/**
 * GlobalPayments webhook event parsing and signature verification.
 *
 * Global Payments signs webhook notifications with a SHA-512 hash.
 * The signature is computed as:
 *
 *   SHA-512( rawRequestBody + appKey )
 *
 * and sent in the `X-GP-Signature` request header as a lowercase hex string.
 * The `appKey` is the developer application key (shared secret) configured
 * in the Global Payments developer portal for the webhook subscription.
 *
 * Reference: GlobalPayments PHP SDK — GenerationUtils::generateXGPSignature()
 * https://github.com/globalpayments/php-sdk/blob/master/src/Utils/GenerationUtils.php
 *
 * Verification is fail-closed: any absent header, absent secret, or
 * signature mismatch returns false without throwing.
 */

import { createHash, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookEvent } from '../../schema/webhook'

/** Header name Global Payments uses for the webhook signature. */
const SIGNATURE_HEADER = 'x-gp-signature'

export function verifyWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    if (!secret) return false
    // Case-insensitive header lookup.
    const sig =
      headers[SIGNATURE_HEADER] ??
      headers['X-GP-Signature'] ??
      headers['X-Gp-Signature'] ??
      Object.entries(headers).find(
        ([k]) => k.toLowerCase() === SIGNATURE_HEADER,
      )?.[1]
    if (!sig) return false
    // Compute SHA-512( rawBody + appKey ) as a lowercase hex string.
    const computed = createHash('sha512')
      .update(payload)
      .update(secret)
      .digest('hex')
    const a = Buffer.from(computed, 'utf8')
    const b = Buffer.from(sig.toLowerCase(), 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const type =
    typeof payload['type'] === 'string'
      ? payload['type']
      : typeof payload['event'] === 'string'
        ? payload['event']
        : String(payload['type'] ?? '')
  const id = typeof payload['id'] === 'string' ? payload['id'] : undefined
  const dataObj =
    typeof payload['data'] === 'object' && payload['data'] !== null
      ? (payload['data'] as Record<string, unknown>)
      : {}
  const resourceId =
    typeof payload['resource_id'] === 'string'
      ? payload['resource_id']
      : typeof dataObj['id'] === 'string'
        ? dataObj['id']
        : ''
  return [
    {
      id,
      platform: 'global-payments',
      type,
      resourceType: 'unknown',
      action: 'unknown',
      resourceId,
      payload,
    },
  ]
}

export const GlobalPaymentsWebhookHandler: WebhookHandler = {
  verifyWebhook,
  parseWebhookEvents,
}

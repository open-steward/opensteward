/**
 * Yapily webhook event parsing and signature verification.
 *
 * Yapily signs all webhook payloads with HMAC-SHA256.  The signature is
 * delivered in the `webhook-signature` request header (hex-encoded).  During
 * secret rotation a second header, `webhook-rotation-signature`, carries the
 * signature produced with the incoming new secret so consumers can rotate
 * without downtime.
 *
 * Verification steps (per Yapily docs):
 *  1. Read the raw body bytes – do NOT parse/re-serialise before hashing.
 *  2. Compute HMAC-SHA256(body, secret) and hex-encode the digest.
 *  3. Constant-time compare against `webhook-signature` (and optionally
 *     `webhook-rotation-signature` during rotation windows).
 *  4. Fail closed: return false when the secret or signature is absent.
 *
 * References:
 *   https://docs.yapily.com/tools-and-services/webhooks/get-started
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookEvent } from '../../schema/webhook'

/** Constant-time hex comparison.  Returns false on any error. */
function safeCompare(a: string, b: string): boolean {
  try {
    if (a.length !== b.length) return false
    return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'))
  } catch {
    return false
  }
}

/**
 * Verify a Yapily webhook payload against its HMAC-SHA256 signature.
 *
 * @param payload - Raw request body bytes (must not be re-serialised).
 * @param headers - Request headers (keys are treated case-insensitively).
 * @param secret  - Webhook secret obtained when registering the endpoint.
 * @returns `true` only when the signature matches; `false` in every other case
 *          (missing secret, missing signature header, or digest mismatch).
 */
export function verifyWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  // Fail closed: a missing or empty secret is a misconfiguration.
  if (!secret) return false

  // Normalise header lookup to lowercase.
  const normalised: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers)) {
    normalised[k.toLowerCase()] = v
  }

  const primary = normalised['webhook-signature']
  const rotation = normalised['webhook-rotation-signature']

  // At least one signature header must be present.
  if (!primary && !rotation) return false

  // Compute expected HMAC-SHA256 digest (hex, lowercase).
  let expected: string
  try {
    expected = createHmac('sha256', Buffer.from(secret, 'utf8'))
      .update(payload)
      .digest('hex')
      .toLowerCase()
  } catch {
    return false
  }

  // Accept the payload if it matches either the primary or the rotation
  // signature (Yapily sends both during a key-rotation window).
  if (primary && safeCompare(expected, primary.toLowerCase())) return true
  if (rotation && safeCompare(expected, rotation.toLowerCase())) return true

  return false
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
      platform: 'yapily',
      type,
      resourceType: 'unknown',
      action: 'unknown',
      resourceId,
      payload,
    },
  ]
}

export const YapilyWebhookHandler: WebhookHandler = {
  verifyWebhook,
  parseWebhookEvents,
}

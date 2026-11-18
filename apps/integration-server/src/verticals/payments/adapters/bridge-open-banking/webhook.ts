/**
 * BridgeOpenBanking webhook event parsing and signature verification.
 *
 * Bridge (Bridgeapi) signs webhooks with HMAC-SHA256.
 * The signature is delivered in the `BridgeApi-Signature` header as a
 * comma-separated list of `v1=<hex>` entries (multiple values appear during
 * secret rotation — only `v1` entries are considered; other schemes are
 * ignored to prevent downgrade attacks).
 *
 * Verification:
 *   expected = HMAC-SHA256(key=signingSecret, message=rawPayloadString)
 *   pass if any v1 entry matches (constant-time compare)
 *
 * References: https://docs.bridgeapi.io/docs/secure-your-webhooks
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookEvent } from '../../schema/webhook'

/**
 * Verify that a Bridge (Bridgeapi) webhook is authentic.
 *
 * Fail-closed: returns false whenever any required input is absent or
 * the signature does not match. Never throws.
 *
 * @param payload  Raw request body buffer (must not be re-parsed).
 * @param headers  Request headers (case-insensitive lookup performed internally).
 * @param secret   The signing secret configured for this webhook endpoint.
 */
export function verifyWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    if (!secret || !payload.length) return false

    // Normalise header lookup — Express lowercases header names.
    const headerValue =
      headers['bridgeapi-signature'] ??
      headers['BridgeApi-Signature'] ??
      headers['bridgeapi_signature'] ??
      ''

    if (!headerValue) return false

    // Extract all v1 signature hex strings from "v1=<hex>,v1=<hex>,..."
    const signatures: string[] = []
    for (const part of headerValue.split(',')) {
      const trimmed = part.trim()
      if (trimmed.startsWith('v1=')) {
        signatures.push(trimmed.slice(3))
      }
    }

    if (signatures.length === 0) return false

    // Compute the expected signature over the raw payload bytes.
    const expected = createHmac('sha256', secret).update(payload).digest('hex').toUpperCase()
    const expectedBuf = Buffer.from(expected, 'utf8')

    // Accept the request if ANY v1 signature matches (supports secret rotation).
    for (const sig of signatures) {
      const sigBuf = Buffer.from(sig.toUpperCase(), 'utf8')
      if (sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf)) {
        return true
      }
    }

    return false
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
      platform: 'bridge-open-banking',
      type,
      resourceType: 'unknown',
      action: 'unknown',
      resourceId,
      payload,
    },
  ]
}

export const BridgeOpenBankingWebhookHandler: WebhookHandler = {
  verifyWebhook,
  parseWebhookEvents,
}

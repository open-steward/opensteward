/**
 * Zuora webhook (callout notification) verification.
 *
 * Zuora callout notifications support HMAC authentication. When configuring a
 * callout template the operator sets:
 *   - hmacKey      – the HTTP header name Zuora will send the signature in
 *   - hmacSecret   – the shared signing secret
 *   - hmacAlgorithm – the hash function (SHA-256 recommended)
 *   - hmacData     – the message that is signed (typically the raw body)
 *
 * Because the header name is operator-configurable, the `secret` parameter
 * accepted by verifyWebhook uses the format `<headerName>:<hmacSecret>`, e.g.:
 *
 *   "x-zuora-signature:my-secret-value"
 *
 * If the secret contains no colon, or the part before the colon is empty, the
 * implementation falls back to checking the `x-zuora-signature` header.
 *
 * The signature is HMAC-SHA-256 of the raw body bytes, hex-encoded, which
 * matches the standard Zuora callout HMAC flow (hmacData = raw body).
 *
 * Refs:
 *   https://developer.zuora.com/v1-api-reference/api/notifications/updatecallouttemplate.md
 *   https://knowledgecenter.zuora.com/Zuora_Platform/Extensibility/Events_and_Notifications
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookEvent } from '../../schema/webhook'

const DEFAULT_HEADER = 'x-zuora-signature'

/**
 * Parse `<headerName>:<secret>` from the secret string.
 * If there is no colon, or the header-name part is empty, use the default
 * header name.
 */
function parseSecret(secret: string): { header: string; key: string } {
  const colonIdx = secret.indexOf(':')
  if (colonIdx > 0) {
    return {
      header: secret.slice(0, colonIdx).toLowerCase(),
      key: secret.slice(colonIdx + 1),
    }
  }
  return { header: DEFAULT_HEADER, key: secret }
}

export function verifyWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    if (!secret) return false
    const { header, key } = parseSecret(secret)
    if (!key) return false

    // Resolve the header value case-insensitively.
    const lowerHeaders = Object.fromEntries(
      Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
    )
    const sig = lowerHeaders[header]
    if (!sig) return false

    // Zuora sends HMAC-SHA-256 of the raw body, hex-encoded.
    const computed = createHmac('sha256', key).update(payload).digest('hex')
    const a = Buffer.from(sig.toLowerCase().replace(/^sha256=/, ''), 'hex')
    const b = Buffer.from(computed, 'hex')
    if (a.length !== b.length || a.length === 0) return false
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
      platform: 'zuora',
      type,
      resourceType: 'unknown',
      action: 'unknown',
      resourceId,
      payload,
    },
  ]
}

export const ZuoraWebhookHandler: WebhookHandler = {
  verifyWebhook,
  parseWebhookEvents,
}

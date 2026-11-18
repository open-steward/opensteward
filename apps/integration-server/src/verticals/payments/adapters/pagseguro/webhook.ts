/**
 * Pagseguro (PagBank) webhook event parsing and signature verification.
 *
 * PagBank signs every notification with SHA-256 of `{accountToken}-{rawPayload}`
 * and sends the hex digest in the `x-authenticity-token` request header.
 *
 * Reference: https://developer.pagbank.com.br/reference/confirmar-autenticidade-da-notificacao
 *
 * The `secret` parameter is the PagBank account token (obtained via iBanking
 * or the access-token endpoint).  When the secret is absent, or when the
 * `x-authenticity-token` header is missing, the function returns `false`
 * (fail-closed).
 */

import { createHash, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookEvent } from '../../schema/webhook'

/**
 * Verify a PagBank webhook notification.
 *
 * @param payload - Raw (unformatted) request body as a Buffer.
 * @param headers - Normalised lowercase request headers.
 * @param secret  - The PagBank account token used as the signing key.
 * @returns `true` only when the computed SHA-256 digest matches the header.
 *          Never throws.
 */
export function verifyWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    if (!secret || !payload.length) return false

    const receivedHex = headers['x-authenticity-token']
    if (!receivedHex || typeof receivedHex !== 'string') return false

    // PagBank scheme: SHA-256( accountToken + "-" + rawPayload )
    const input = `${secret}-${payload.toString('utf8')}`
    const expectedHex = createHash('sha256').update(input, 'utf8').digest('hex')

    // Constant-time comparison to prevent timing attacks.
    // Both strings must be the same byte length for timingSafeEqual.
    const expected = Buffer.from(expectedHex, 'hex')
    const received = Buffer.from(receivedHex, 'hex')
    if (expected.length !== received.length) return false

    return timingSafeEqual(expected, received)
  } catch {
    return false
  }
}

export function parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const type =
    typeof payload['event'] === 'string'
      ? payload['event']
      : typeof payload['type'] === 'string'
        ? payload['type']
        : String(payload['event'] ?? payload['type'] ?? '')
  const id = typeof payload['id'] === 'string' ? payload['id'] : undefined
  const resource =
    typeof payload['resource'] === 'object' && payload['resource'] !== null
      ? (payload['resource'] as Record<string, unknown>)
      : {}
  const resourceId =
    typeof payload['resource_id'] === 'string'
      ? payload['resource_id']
      : typeof resource['id'] === 'string'
        ? resource['id']
        : ''
  return [
    {
      id,
      platform: 'pagseguro',
      type,
      resourceType: 'unknown',
      action: 'unknown',
      resourceId,
      payload,
    },
  ]
}

export const PagseguroWebhookHandler: WebhookHandler = {
  verifyWebhook,
  parseWebhookEvents,
}

/**
 * Wise webhook event parsing and signature verification.
 *
 * Wise signs every outgoing webhook with an RSA-SHA256 digest of the raw
 * message body. The Base64-encoded signature is transmitted in the
 * `X-Signature-SHA256` request header. PKCS#1 v1.5 padding is used.
 *
 * The `secret` parameter must be a PEM-encoded RSA public key (either the
 * Wise-published sandbox key or the live key fetched from the Wise API).
 * Fail-closed: any missing header, missing/invalid key, or verification
 * failure returns `false` without throwing.
 *
 * Docs: https://docs.wise.com/guides/developer/webhooks/event-handling
 * Reference impl: https://github.com/transferwise/digital-signatures-examples
 */

import { createPublicKey, verify as cryptoVerify, constants } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookEvent } from '../../schema/webhook'

/**
 * Well-known Wise sandbox public key (RSA-2048).
 * Source: https://github.com/transferwise/digital-signatures-examples/blob/main/verify-webhook-signature/verify-signature.js
 */
export const WISE_SANDBOX_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAwpb91cEYuyJNQepZAVfP
ZIlPZfNUefH+n6w9SW3fykqKu938cR7WadQv87oF2VuT+fDt7kqeRziTmPSUhqPU
ys/V2Q1rlfJuXbE+Gga37t7zwd0egQ+KyOEHQOpcTwKmtZ81ieGHynAQzsn1We3j
wt760MsCPJ7GMT141ByQM+yW1Bx+4SG3IGjXWyqOWrcXsxAvIXkpUD/jK/L958Cg
nZEgz0BSEh0QxYLITnW1lLokSx/dTianWPFEhMC9BgijempgNXHNfcVirg1lPSyg
z7KqoKUN0oHqWLr2U1A+7kqrl6O2nx3CKs1bj1hToT1+p4kcMoHXA7kA+VBLUpEs
VwIDAQAB
-----END PUBLIC KEY-----`

/** Header name Wise uses to transmit the RSA-SHA256 signature. */
const SIG_HEADER = 'x-signature-sha256'

export function verifyWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    // Fail closed: both a public key and a signature must be present.
    if (!secret) return false

    const sigB64 =
      headers[SIG_HEADER] ??
      headers['X-Signature-SHA256'] ??
      headers['X-SIGNATURE-SHA256']
    if (!sigB64) return false

    const sigBuf = Buffer.from(sigB64, 'base64')

    const publicKey = createPublicKey({ key: secret, format: 'pem' })

    return cryptoVerify(
      'RSA-SHA256',
      payload,
      { key: publicKey, padding: constants.RSA_PKCS1_PADDING },
      sigBuf,
    )
  } catch {
    return false
  }
}

export function parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const type =
    typeof payload['event_type'] === 'string'
      ? payload['event_type']
      : typeof payload['type'] === 'string'
        ? payload['type']
        : typeof payload['event'] === 'string'
          ? payload['event']
          : String(payload['type'] ?? '')
  const id = typeof payload['subscription_id'] === 'string' ? payload['subscription_id'] : undefined
  const dataObj =
    typeof payload['data'] === 'object' && payload['data'] !== null
      ? (payload['data'] as Record<string, unknown>)
      : {}
  const resource =
    typeof dataObj['resource'] === 'object' && dataObj['resource'] !== null
      ? (dataObj['resource'] as Record<string, unknown>)
      : {}
  const resourceId =
    typeof resource['id'] === 'string'
      ? resource['id']
      : typeof resource['id'] === 'number'
        ? String(resource['id'])
        : typeof payload['resource_id'] === 'string'
          ? payload['resource_id']
          : typeof dataObj['id'] === 'string'
            ? dataObj['id']
            : ''
  return [
    {
      id,
      platform: 'wise',
      type,
      resourceType: 'unknown',
      action: 'unknown',
      resourceId,
      payload,
    },
  ]
}

export const WiseWebhookHandler: WebhookHandler = {
  verifyWebhook,
  parseWebhookEvents,
}

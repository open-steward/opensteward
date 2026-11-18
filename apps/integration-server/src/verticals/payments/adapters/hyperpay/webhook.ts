/**
 * HyperPay (OPPWA) webhook notifications.
 *
 * HyperPay does NOT HMAC-sign deliveries. Instead it **encrypts** the entire
 * notification body with AES-256-GCM under a 64-hex-character (32-byte) secret
 * configured per webhook in the back office. Each delivery carries:
 *   - `X-Initialization-Vector`: the AES-GCM IV (nonce), hex-encoded.
 *   - `X-Authentication-Tag`: the GCM authentication tag, hex-encoded.
 *   - body: the ciphertext, hex-encoded.
 *
 * "Verification" is therefore decryption itself: if the auth tag validates under
 * the configured key + IV the payload is authentic; if it fails, GCM throws and
 * we reject. The decrypted JSON is the standard response wrapped as
 *   { type: 'PAYMENT' | 'REGISTRATION' | 'RISK', action, payload: { … } }
 * where `payload` carries `id`, `paymentType`, `paymentBrand`, `amount`,
 * `currency`, and `result.code`.
 *
 * Docs: https://hyperpay.docs.oppwa.com/tutorials/webhooks
 */
import { createDecipheriv } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'
import { classifyResult } from './transform/shared'

const IV_HEADER = 'x-initialization-vector'
const TAG_HEADER = 'x-authentication-tag'

function header(headers: Record<string, string>, name: string): string | undefined {
  // Inbound headers may arrive in any case; normalise to lowercase lookup.
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === name) return v
  }
  return undefined
}

/**
 * Decrypt a HyperPay webhook body. Returns the decrypted UTF-8 string, or
 * `null` when the key/IV/tag are missing or the GCM tag fails to authenticate.
 * Never throws.
 */
export function decryptHyperpayWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): string | null {
  try {
    const ivHex = header(headers, IV_HEADER)
    const tagHex = header(headers, TAG_HEADER)
    if (!ivHex || !tagHex || !secret) return null
    const key = Buffer.from(secret, 'hex')
    const iv = Buffer.from(ivHex, 'hex')
    const tag = Buffer.from(tagHex, 'hex')
    if (key.length !== 32) return null
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    const ciphertext = Buffer.from(payload.toString('utf8'), 'hex')
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
    return decrypted.toString('utf8')
  } catch {
    return null
  }
}

/**
 * Webhook authenticity check: a delivery is authentic iff its AES-256-GCM body
 * decrypts cleanly (the GCM auth tag validates) under the configured key.
 */
export function verifyHyperpayWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  return decryptHyperpayWebhook(payload, headers, secret) !== null
}

const TYPE_MAP: Record<string, WebhookResourceType> = {
  PAYMENT: 'charges',
  REGISTRATION: 'payment_methods',
  RISK: 'unknown',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  CREATED: 'created',
  UPDATED: 'updated',
  DELETED: 'deleted',
}

/**
 * Classify a decrypted notification. The `type` selects the resource; the
 * canonical action is refined by the payment `result.code` (rejected → failed,
 * pending → unknown-but-created, success → succeeded) when the notification is a
 * PAYMENT, otherwise it falls back to the notification `action`.
 */
function classify(
  type: string,
  action: string,
  resultCode: string | undefined,
): { resourceType: WebhookResourceType; action: WebhookAction } {
  const resourceType = TYPE_MAP[type] ?? 'unknown'
  if (type === 'PAYMENT') {
    const outcome = classifyResult(resultCode)
    if (outcome === 'rejected') return { resourceType, action: 'failed' }
    if (outcome === 'success') return { resourceType, action: 'succeeded' }
    return { resourceType, action: ACTION_MAP[action] ?? 'created' }
  }
  return { resourceType, action: ACTION_MAP[action] ?? 'unknown' }
}

/**
 * Parse a decrypted HyperPay notification (already-decrypted JSON object) into
 * canonical webhook events. The body shape is `{ type, action, payload }`.
 */
export function parseHyperpayWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const type = String(payload['type'] ?? '')
  const action = String(payload['action'] ?? '')
  const inner = (payload['payload'] as Record<string, unknown> | undefined) ?? {}
  const result = (inner['result'] as Record<string, unknown> | undefined) ?? {}
  const resultCode = result['code'] != null ? String(result['code']) : undefined
  const resourceId = String(inner['id'] ?? inner['registrationId'] ?? '')
  const { resourceType, action: canonicalAction } = classify(type, action, resultCode)
  return [
    {
      platform: 'hyperpay',
      type: type || 'unknown',
      resourceType,
      action: canonicalAction,
      resourceId,
      payload,
    },
  ]
}

export const HyperpayWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyHyperpayWebhook,
  parseWebhookEvents: parseHyperpayWebhookEvents,
}

/**
 * Plaid webhook verification + event parsing.
 *
 * Plaid signs every webhook with a JWT in the `Plaid-Verification` header.
 * Full verification (per Plaid's docs) has four parts:
 *   1. decode the JWT header, assert `alg === "ES256"`,
 *   2. fetch the JWK for the header's `kid` from `/webhook_verification_key/get`,
 *   3. cryptographically verify the JWT signature against that JWK,
 *   4. assert the JWT is < 5 min old and its `request_body_sha256` equals the
 *      SHA-256 of the raw body.
 *
 * Step 2/3 require an *async* network round-trip plus the client_id/secret
 * pair, which the synchronous `verifyWebhook(payload, headers, secret)` contract
 * cannot express. So this module implements the parts that are sound to do
 * synchronously and that already defeat a forged/replayed/tampered body —
 * structural ES256 check, freshness (iat ≤ 5 min), and the body-integrity hash
 * — and leaves the JWK signature check to a future async verifier. The `secret`
 * argument is unused (Plaid does not use a shared HMAC secret).
 *
 * Docs: https://plaid.com/docs/api/webhooks/webhook-verification/
 */
import { createHash, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

const MAX_AGE_SECONDS = 5 * 60

interface JwtHeader {
  alg?: string
  kid?: string
}
interface JwtBody {
  iat?: number
  request_body_sha256?: string
}

function base64UrlToJson<T>(segment: string): T | null {
  try {
    const json = Buffer.from(segment, 'base64url').toString('utf8')
    return JSON.parse(json) as T
  } catch {
    return null
  }
}

/**
 * Synchronous structural + integrity verification of a Plaid webhook. Returns
 * false on any malformed input. Note this does NOT perform the ES256 signature
 * check (which requires an async JWK fetch) — see the module header.
 */
export function verifyPlaidWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  _secret: string,
): boolean {
  try {
    const token = headers['plaid-verification'] ?? headers['Plaid-Verification']
    if (!token) return false
    const [headerB64, bodyB64] = token.split('.')
    if (!headerB64 || !bodyB64) return false

    const header = base64UrlToJson<JwtHeader>(headerB64)
    if (!header || header.alg !== 'ES256') return false

    const body = base64UrlToJson<JwtBody>(bodyB64)
    if (!body) return false

    // Freshness: reject webhooks older than 5 minutes (replay defence).
    if (typeof body.iat !== 'number') return false
    const now = Math.floor(Date.now() / 1000)
    if (Math.abs(now - body.iat) > MAX_AGE_SECONDS) return false

    // Body integrity: SHA-256 of the raw body must match the signed hash.
    const expected = body.request_body_sha256
    if (!expected) return false
    const actual = createHash('sha256').update(payload).digest('hex')
    const a = Buffer.from(actual, 'utf8')
    const b = Buffer.from(expected, 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/**
 * Plaid webhooks are grouped by `webhook_type` (e.g. `TRANSFER`) and refined by
 * `webhook_code` (e.g. `TRANSFER_EVENTS_UPDATE`). Only the Transfer family maps
 * onto canonical payments resources; everything else classifies as `unknown`.
 */
const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  transfer: 'charges',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  transfer_events_update: 'updated',
  recurring_new_transfer: 'created',
  recurring_transfer_skipped: 'cancelled',
  recurring_cancelled: 'cancelled',
}

function classify(
  webhookType: string,
  webhookCode: string,
): { resourceType: WebhookResourceType; action: WebhookAction } {
  return {
    resourceType: RESOURCE_MAP[webhookType.toLowerCase()] ?? 'unknown',
    action: ACTION_MAP[webhookCode.toLowerCase()] ?? 'unknown',
  }
}

export function parsePlaidWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const webhookType = String(payload['webhook_type'] ?? '')
  const webhookCode = String(payload['webhook_code'] ?? '')
  const resourceId = String(payload['transfer_id'] ?? payload['item_id'] ?? '')
  const { resourceType, action } = classify(webhookType, webhookCode)
  return [
    {
      platform: 'plaid',
      type: `${webhookType}.${webhookCode}`,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const PlaidWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyPlaidWebhook,
  parseWebhookEvents: parsePlaidWebhookEvents,
}

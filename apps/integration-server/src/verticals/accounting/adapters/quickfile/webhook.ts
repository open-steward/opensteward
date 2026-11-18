/**
 * QuickFile webhook verification and parsing.
 *
 * Verification: QuickFile signs each webhook with an MD5 hash computed from:
 *   MD5( HookId + SecretKey + AccNumber )
 * The Signature is included in the JSON payload body (not a header).
 *
 * The "secret" passed to verifyWebhook must be "accNumber:webhookSecret"
 * (colon-separated) so both values are available.
 *
 * Docs: https://api.quickfile.co.uk/Webhooks
 */

import { createHash } from 'node:crypto'
import { timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '../../webhook'
import type { WebhookEvent, WebhookResourceType, WebhookAction } from '../../schema/webhook'

// ── QuickFile payload types ───────────────────────────────────────────────────

type QuickFileWebhookPayload = {
  HookId?: string
  Signature?: string
  Timestamp?: string
  PayLoad?: Record<string, unknown>
}

// ── Type maps ─────────────────────────────────────────────────────────────────

function detectResourceType(payLoad: Record<string, unknown>): WebhookResourceType {
  const key = Object.keys(payLoad)[0] ?? ''
  const lower = key.toLowerCase()
  if (lower.includes('invoice')) return 'invoice'
  if (lower.includes('purchase') || lower.includes('bill')) return 'bill'
  if (lower.includes('client')) return 'contact'
  if (lower.includes('supplier')) return 'contact'
  if (lower.includes('payment')) return 'transaction'
  return 'unknown'
}

function detectAction(key: string): WebhookAction {
  const lower = key.toLowerCase()
  if (lower.includes('created') || lower.includes('create')) return 'created'
  if (lower.includes('updated') || lower.includes('update')) return 'updated'
  if (lower.includes('deleted') || lower.includes('delete') || lower.includes('removed')) return 'deleted'
  return 'unknown'
}

function extractIds(payLoad: Record<string, unknown>): string[] {
  for (const v of Object.values(payLoad)) {
    if (Array.isArray(v)) {
      return v
        .map((item: unknown) =>
          typeof item === 'object' && item !== null
            ? String((item as Record<string, unknown>)['Id'] ?? '')
            : '',
        )
        .filter(Boolean)
    }
  }
  return []
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const quickfileWebhook: WebhookHandler = {
  /**
   * secret must be "accNumber:webhookSecret" (colon-separated).
   * payload is the raw Buffer (we parse it to extract the Signature and HookId).
   */
  verifyWebhook(payload, _headers, secret) {
    try {
      const body = JSON.parse(payload.toString()) as QuickFileWebhookPayload
      const hookId = body.HookId ?? ''
      const signature = body.Signature ?? ''
      if (!hookId || !signature) return false

      const colonIdx = secret.indexOf(':')
      if (colonIdx === -1) return false
      const accNumber = secret.slice(0, colonIdx)
      const webhookSecret = secret.slice(colonIdx + 1)

      const expected = createHash('md5')
        .update(hookId + webhookSecret + accNumber)
        .digest('hex')

      const a = Buffer.from(expected)
      const b = Buffer.from(signature.toLowerCase())
      if (a.length !== b.length) return false
      return timingSafeEqual(a, b)
    } catch {
      return false
    }
  },

  parseWebhookEvents(payload) {
    const body = payload as QuickFileWebhookPayload
    const payLoad = body.PayLoad ?? {}
    const payLoadKey = Object.keys(payLoad)[0] ?? ''
    const resourceType = detectResourceType(payLoad)
    const action = detectAction(payLoadKey)
    const ids = extractIds(payLoad)

    if (ids.length === 0) {
      return [
        {
          id: body.HookId,
          platform: 'quickfile',
          type: `${resourceType}.${action}`,
          resourceType,
          action,
          resourceId: body.HookId ?? 'unknown',
          payload,
        },
      ]
    }

    return ids.map((resourceId): WebhookEvent => ({
      id: body.HookId,
      platform: 'quickfile',
      type: `${resourceType}.${action}`,
      resourceType,
      action,
      resourceId,
      payload,
    }))
  },
}

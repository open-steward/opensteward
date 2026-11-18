/**
 * Payhawk webhook verification and parsing.
 *
 * Verification: Payhawk signs each delivery using RSA-SHA256.
 * The base64-encoded signature is delivered in the `x-payhawk-signature`
 * header. The `secret` supplied to `verifyWebhook` must be the RSA public
 * key PEM string issued when creating the webhook subscription.
 *
 * Event types (from docs):
 *   expense.*  payment.*  deposit.*  supplier.*  purchase-order.*  expense-report.*
 *
 * Docs: https://developers.payhawk.com/  (Webhooks section)
 */

import { createVerify } from 'node:crypto'
import type { WebhookHandler } from '../../webhook'
import type { WebhookEvent, WebhookResourceType, WebhookAction } from '../../schema/webhook'

// ── Payhawk payload types ─────────────────────────────────────────────────────

type PayhawkWebhookPayload = {
  /** Payhawk event type string, e.g. "expense.created" */
  eventType?: string
  /** The primary resource identifier */
  id?: string
  /** Account (organisation) identifier */
  accountId?: string
  [key: string]: unknown
}

// ── Type maps ─────────────────────────────────────────────────────────────────

function mapResourceType(eventType: string): WebhookResourceType {
  const prefix = eventType.split('.')[0] ?? ''
  const map: Record<string, WebhookResourceType> = {
    expense: 'expense',
    payment: 'payment',
    deposit: 'transaction',
    supplier: 'contact',
    'purchase-order': 'purchaseorder',
    'expense-report': 'expense',
    'one-time-login-request': 'unknown',
  }
  return map[prefix] ?? 'unknown'
}

function mapAction(eventType: string): WebhookAction {
  const suffix = eventType.split('.').slice(1).join('.')
  if (suffix.includes('creat')) return 'created'
  if (
    suffix.includes('updat') ||
    suffix.includes('review') ||
    suffix.includes('approv') ||
    suffix.includes('settl') ||
    suffix.includes('authoriz') ||
    suffix.includes('convert') ||
    suffix.includes('upload') ||
    suffix.includes('status')
  )
    return 'updated'
  if (suffix.includes('delet') || suffix.includes('reject') || suffix.includes('revert'))
    return 'deleted'
  return 'unknown'
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const payhawkWebhook: WebhookHandler = {
  /**
   * Verifies the RSA-SHA256 signature in the `x-payhawk-signature` header.
   *
   * `secret` must be the RSA public key in PEM format that Payhawk issues
   * when you create the webhook subscription.
   *
   * Pass an empty string to skip verification during local development —
   * do not use this in production.
   */
  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    try {
      if (!secret) return true

      const sig = headers['x-payhawk-signature'] ?? headers['X-Payhawk-Signature']
      if (!sig) return false

      const verify = createVerify('RSA-SHA256')
      verify.update(payload)
      verify.end()
      return verify.verify(secret, sig, 'base64')
    } catch {
      return false
    }
  },

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    const body = payload as PayhawkWebhookPayload
    const eventType = (body.eventType ?? '').toLowerCase()

    if (!eventType) return []

    const resourceType = mapResourceType(eventType)
    const action = mapAction(eventType)
    const resourceId = (body.id ?? '') as string

    const event: WebhookEvent = {
      platform: 'payhawk',
      type: `${resourceType}.${action}`,
      resourceType,
      action,
      resourceId,
      tenantId: body.accountId != null ? String(body.accountId) : undefined,
      payload,
    }

    return [event]
  },
}

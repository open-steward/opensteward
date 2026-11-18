import type { WebhookHandler } from '@opensteward/shared'
/**
 * payrexx webhook verification uses HMAC-SHA256 of the raw body.
 * Signature is sent in the `x-payrexx-signature` header (hex-encoded).
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookEvent, WebhookResourceType, WebhookAction } from '../../schema/webhook'

function classify(eventType: string): { resourceType: WebhookResourceType; action: WebhookAction } {
  const v = typeof eventType === 'string' ? eventType.toLowerCase() : ''
  let resourceType: WebhookResourceType = 'unknown'
  let action: WebhookAction = 'unknown'

  if (v.includes('charge') || v.includes('payment') || v.includes('transaction') || v.includes('order')) resourceType = 'charges'
  else if (v.includes('refund')) resourceType = 'refunds'
  else if (v.includes('customer')) resourceType = 'customers'
  else if (v.includes('subscription')) resourceType = 'subscriptions'
  else if (v.includes('invoice')) resourceType = 'invoices'
  else if (v.includes('payout') || v.includes('transfer') || v.includes('disbursement')) resourceType = 'payouts'
  else if (v.includes('dispute') || v.includes('chargeback')) resourceType = 'disputes'

  if (v.includes('success') || v.includes('completed') || v.includes('paid') || v.includes('captured')) action = 'paid'
  else if (v.includes('fail') || v.includes('declined') || v.includes('rejected')) action = 'failed'
  else if (v.includes('creat') || v.includes('initiat')) action = 'created'
  else if (v.includes('updat') || v.includes('modif')) action = 'updated'
  else if (v.includes('cancel') || v.includes('void') || v.includes('revers')) action = 'cancelled'

  return { resourceType, action }
}

export function verifyPayrexxWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const sig = headers['x-payrexx-signature'] ?? headers['X-Payrexx-Signature']
    if (!sig) return false
    const expected = createHmac('sha256', secret).update(payload).digest('hex')
    const a = Buffer.from(sig, 'hex')
    const b = Buffer.from(expected, 'hex')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function parsePayrexxWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const eventType = String(payload['transaction.status'] ?? payload['event'] ?? payload['type'] ?? '')
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? payload
  const resourceId = String(
    data['transaction.id'] ?? data['id'] ?? data['uuid'] ?? payload['id'] ?? '',
  )
  const { resourceType, action } = classify(eventType)
  return [
    {
      platform: 'payrexx',
      type: eventType,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const PayrexxWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyPayrexxWebhook,
  parseWebhookEvents: parsePayrexxWebhookEvents,
}

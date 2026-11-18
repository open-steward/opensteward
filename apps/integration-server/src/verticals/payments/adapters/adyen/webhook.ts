/**
 * Adyen sends standard webhook notifications as a JSON envelope with one
 * or more `notificationItems`, each carrying an HMAC-SHA-256 signature
 * over a concatenated field list. The signature lives in
 * `additionalData.hmacSignature`.
 *
 * Docs: https://docs.adyen.com/development-resources/webhooks/verify-hmac-signatures/
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

interface AdyenNotificationItem {
  pspReference?: string
  eventCode?: string
  success?: 'true' | 'false'
  merchantReference?: string
  amount?: { value?: number; currency?: string }
  paymentMethod?: string
  reason?: string
  additionalData?: { hmacSignature?: string; [k: string]: unknown }
  [k: string]: unknown
}

function signedFields(item: AdyenNotificationItem): string {
  return [
    item.pspReference ?? '',
    item.merchantReference ?? '',
    item.amount?.value != null ? String(item.amount.value) : '',
    item.amount?.currency ?? '',
    item.eventCode ?? '',
    String(item.success ?? ''),
  ].join(':')
}

export function verifyAdyenWebhook(
  payload: Buffer,
  _headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const body = JSON.parse(payload.toString('utf8')) as {
      notificationItems?: Array<{ NotificationRequestItem: AdyenNotificationItem }>
    }
    const items = body.notificationItems ?? []
    if (items.length === 0) return false
    const key = Buffer.from(secret, 'hex')
    return items.every((wrap) => {
      const item = wrap.NotificationRequestItem
      const sig = item.additionalData?.hmacSignature
      if (!sig) return false
      const expected = createHmac('sha256', key).update(signedFields(item)).digest('base64')
      const a = Buffer.from(sig)
      const b = Buffer.from(expected)
      if (a.length !== b.length) return false
      return timingSafeEqual(a, b)
    })
  } catch {
    return false
  }
}

const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  AUTHORISATION: 'charges',
  CAPTURE: 'charges',
  CAPTURE_FAILED: 'charges',
  REFUND: 'refunds',
  REFUND_FAILED: 'refunds',
  REFUNDED_REVERSED: 'refunds',
  CANCELLATION: 'charges',
  CHARGEBACK: 'disputes',
  NOTIFICATION_OF_CHARGEBACK: 'disputes',
  DISPUTE: 'disputes',
  PAYOUT_THIRDPARTY: 'payouts',
  PAYOUT_DECLINE: 'payouts',
  RECURRING_CONTRACT: 'subscriptions',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  AUTHORISATION: 'created',
  CAPTURE: 'paid',
  CAPTURE_FAILED: 'failed',
  REFUND: 'refunded',
  REFUND_FAILED: 'failed',
  CANCELLATION: 'cancelled',
  CHARGEBACK: 'disputed',
  NOTIFICATION_OF_CHARGEBACK: 'disputed',
  PAYOUT_THIRDPARTY: 'paid',
  PAYOUT_DECLINE: 'failed',
  RECURRING_CONTRACT: 'created',
}

export function parseAdyenWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const items = (payload['notificationItems'] as Array<{ NotificationRequestItem: AdyenNotificationItem }> | undefined) ?? []
  return items.map((wrap) => {
    const item = wrap.NotificationRequestItem
    const code = item.eventCode ?? ''
    return {
      platform: 'adyen',
      type: code,
      resourceType: RESOURCE_MAP[code] ?? 'unknown',
      action: ACTION_MAP[code] ?? 'unknown',
      resourceId: item.pspReference ?? '',
      externalAccountId:
        (item as { merchantAccountCode?: string }).merchantAccountCode || undefined,
      payload: item as Record<string, unknown>,
    }
  })
}

export const AdyenWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyAdyenWebhook,
  parseWebhookEvents: parseAdyenWebhookEvents,
}

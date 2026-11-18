/**
 * Mollie uses per-payment webhook URLs and verification-by-fetch: a webhook
 * delivery contains the resource ID, the consumer re-fetches the resource
 * via the API to validate. No HMAC signature exists at the transport
 * level, so the verifier here only checks for a payment ID in the payload.
 *
 * Docs: https://docs.mollie.com/docs/webhooks
 */

import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

function classifyId(id: string | undefined): {
  resourceType: WebhookResourceType
  action: WebhookAction
} {
  if (!id) return { resourceType: 'unknown', action: 'unknown' }
  if (id.startsWith('tr_')) return { resourceType: 'charges', action: 'updated' }
  if (id.startsWith('re_')) return { resourceType: 'refunds', action: 'updated' }
  if (id.startsWith('chb_')) return { resourceType: 'disputes', action: 'updated' }
  if (id.startsWith('sub_')) return { resourceType: 'subscriptions', action: 'updated' }
  if (id.startsWith('po_')) return { resourceType: 'payouts', action: 'updated' }
  if (id.startsWith('cst_')) return { resourceType: 'customers', action: 'updated' }
  if (id.startsWith('mdt_')) return { resourceType: 'mandates', action: 'updated' }
  return { resourceType: 'unknown', action: 'unknown' }
}

export function verifyMollieWebhook(
  payload: Buffer,
  _headers: Record<string, string>,
  _secret: string,
): boolean {
  try {
    const body = payload.toString('utf8')
    return body.includes('id=') || body.includes('"id"')
  } catch {
    return false
  }
}

export function parseMollieWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const id = String(payload['id'] ?? '')
  const { resourceType, action } = classifyId(id)
  return [
    {
      platform: 'mollie',
      type: `${resourceType}.${action}`,
      resourceType,
      action,
      resourceId: id,
      payload,
    },
  ]
}

export const MollieWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyMollieWebhook,
  parseWebhookEvents: parseMollieWebhookEvents,
}

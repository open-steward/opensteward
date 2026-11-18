/**
 * Mercado Pago signs webhook notifications with an HMAC over
 * `id:<dataId>;request-id:<requestId>;ts:<ts>;` using the webhook secret.
 * The result lives in `x-signature` as `ts=…,v1=…`.
 *
 * Docs: https://www.mercadopago.com/developers/en/docs/your-integrations/notifications/webhooks#editor_3
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  payment: 'charges',
  subscription_preapproval: 'subscriptions',
  subscription_authorized_payment: 'charges',
  point_integration_wh: 'unknown',
  chargebacks: 'disputes',
  merchant_order: 'charges',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  created: 'created',
  updated: 'updated',
  payment_created: 'created',
}

function classify(type: string, action: string | undefined): {
  resourceType: WebhookResourceType
  action: WebhookAction
} {
  return {
    resourceType: RESOURCE_MAP[type] ?? 'unknown',
    action: ACTION_MAP[action ?? 'updated'] ?? 'updated',
  }
}

function parseSig(header: string): { ts?: string; v1?: string } {
  const out: { ts?: string; v1?: string } = {}
  for (const part of header.split(',')) {
    const [k, v] = part.split('=')
    if (!k || !v) continue
    if (k.trim() === 'ts') out.ts = v.trim()
    else if (k.trim() === 'v1') out.v1 = v.trim()
  }
  return out
}

export function verifyMercadoPagoWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const sigHeader = headers['x-signature'] ?? headers['X-Signature']
    const requestId = headers['x-request-id'] ?? headers['X-Request-Id']
    if (!sigHeader || !requestId) return false
    const sig = parseSig(sigHeader)
    if (!sig.ts || !sig.v1) return false
    const body = JSON.parse(payload.toString('utf8')) as { data?: { id?: string } }
    const dataId = body.data?.id ?? ''
    const manifest = `id:${dataId};request-id:${requestId};ts:${sig.ts};`
    const expected = createHmac('sha256', secret).update(manifest).digest('hex')
    const a = Buffer.from(sig.v1, 'hex')
    const b = Buffer.from(expected, 'hex')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function parseMercadoPagoWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const type = String(payload['type'] ?? '')
  const action = String(payload['action'] ?? '')
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? {}
  const resourceId = String(data['id'] ?? '')
  const id = String(payload['id'] ?? '')
  const { resourceType, action: act } = classify(type, action)
  return [
    {
      id: id || undefined,
      platform: 'mercado-pago',
      type: action ? `${type}.${action}` : type,
      resourceType,
      action: act,
      resourceId,
      payload,
    },
  ]
}

export const MercadoPagoWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyMercadoPagoWebhook,
  parseWebhookEvents: parseMercadoPagoWebhookEvents,
}

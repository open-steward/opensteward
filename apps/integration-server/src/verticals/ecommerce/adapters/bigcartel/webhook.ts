/**
 * Big Cartel webhook verification and event parsing.
 *
 * Big Cartel does not have a native webhook API. This module provides
 * a minimal stub so the adapter satisfies the interface. If Big Cartel
 * adds webhook support in the future, this can be fleshed out.
 */

import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

/**
 * Big Cartel does not sign webhooks (no webhook support). Always returns false.
 */
export function verifyBigCartelWebhook(
  _payload: Buffer,
  _headers: Record<string, string>,
  _secret: string,
): boolean {
  return false
}

const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  product: 'products',
  order: 'orders',
  category: 'collections',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  created: 'created',
  updated: 'updated',
  deleted: 'deleted',
}

/**
 * Parse a Big Cartel webhook payload into canonical events.
 * Since Big Cartel has no native webhooks, this is a best-effort
 * parser for any custom webhook relay that follows `resource.action` topic format.
 */
export function parseBigCartelWebhookEvents(
  payload: Record<string, unknown>,
  topic?: string,
): WebhookEvent[] {
  if (!topic) return []
  const [group = 'unknown', verb = 'unknown'] = topic.toLowerCase().split('.')
  const resourceType: WebhookResourceType = RESOURCE_MAP[group] ?? 'unknown'
  const action: WebhookAction = ACTION_MAP[verb] ?? 'unknown'
  const rawId = payload['id']
  const resourceId = rawId == null ? '' : String(rawId)

  return [
    {
      platform: 'bigcartel',
      type: `${resourceType}.${action}`,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const bigcartelWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyBigCartelWebhook,
  parseWebhookEvents: parseBigCartelWebhookEvents,
}

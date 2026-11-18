/**
 * ikas webhook event parsing.
 *
 * ikas pushes webhook deliveries to registered endpoints. The payload
 * contains a `scope` field (e.g. `store/order/created`) that identifies
 * the event type. ikas does not document a signature-verification mechanism
 * for webhooks in its public API docs; therefore `verifyWebhook` always
 * returns `true` (trust the network / mTLS / IP allowlist instead).
 *
 * If ikas adds HMAC signature verification in the future, implement it here
 * and update the verifyWebhook method in index.ts accordingly.
 *
 * Webhook setup: use the `saveWebhook` GraphQL mutation with an endpoint URL
 * and a scope string (e.g. `store/order/created`).
 *
 * Docs: https://ikas.dev/docs/api/admin-api/webhooks
 */

import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

// ── Scope → canonical mapping ────────────────────────────────────────────────

/**
 * ikas scopes follow the pattern `store/<resource>/<verb>`.
 * Map resource segments to canonical resource types.
 */
const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  order: 'orders',
  product: 'products',
  customer: 'customers',
  inventory: 'inventory_levels',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  created: 'created',
  create: 'created',
  updated: 'updated',
  update: 'updated',
  deleted: 'deleted',
  delete: 'deleted',
}

function mapScope(scope: string): { resourceType: WebhookResourceType; action: WebhookAction } {
  // Scope format: "store/<resource>/<verb>", e.g. "store/order/created"
  const parts = scope.toLowerCase().split('/')
  // parts[0] = 'store', parts[1] = resource, parts[2] = verb
  const resource = parts[1] ?? 'unknown'
  const verb = parts[2] ?? 'unknown'
  return {
    resourceType: RESOURCE_MAP[resource] ?? 'unknown',
    action: ACTION_MAP[verb] ?? 'unknown',
  }
}

export function parseIkasWebhookEvents(
  payload: Record<string, unknown>,
  scope?: string,
): WebhookEvent[] {
  const effectiveScope =
    scope ??
    (payload['scope'] as string | undefined) ??
    (payload['__scope'] as string | undefined) ??
    ''

  const { resourceType, action } = effectiveScope
    ? mapScope(effectiveScope)
    : { resourceType: 'unknown' as const, action: 'unknown' as const }

  const rawId = payload['id']
  const resourceId = rawId == null ? '' : String(rawId)

  return [
    {
      platform: 'ikas',
      type: `${resourceType}.${action}`,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export function verifyIkasWebhook(): boolean {
  return true
}

export const ikasWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyIkasWebhook,
  parseWebhookEvents: parseIkasWebhookEvents,
}

import type { WebhookEvent } from '../../schema/webhook'

/**
 * SugarCRM does not provide a standardised HMAC-signed webhook mechanism.
 * Verification always returns true; callers should protect the endpoint at
 * the network/auth layer instead.
 */
export function verifySugarWebhook(
  _payload: Buffer,
  _headers: Record<string, string>,
  _secret: string,
): boolean {
  return true
}

export function parseSugarWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const moduleName = String(payload['module_name'] ?? 'unknown').toLowerCase()
  const event = String(payload['event'] ?? 'unknown').toLowerCase()
  const id = String(
    (payload['data'] as Record<string, unknown> | undefined)?.['id'] ?? 'unknown',
  )

  return [{
    platform: 'sugarcrm',
    type: `${moduleName}.${event}`,
    resourceType: 'unknown',
    action: 'unknown',
    resourceId: id,
    payload,
  }]
}

export const sugarcrmWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifySugarWebhook,
  parseWebhookEvents: parseSugarWebhookEvents,
}

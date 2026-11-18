/**
 * Webhook utilities — re-exported from @opensteward/shared.
 */
export { verifyHmacSha256, stripPrefix } from '@opensteward/shared'

// Re-export the vertical-specific WebhookEvent for adapter use
export type { WebhookEvent } from './schema/webhook'

import type { WebhookEvent } from './schema/webhook'

/**
 * Crm-specific WebhookHandler — typed with the vertical's WebhookEvent.
 * (The base WebhookHandler in open-shared uses unknown[] for vertical-agnosticism.)
 */
export type WebhookHandler = {
  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean
  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[]
}

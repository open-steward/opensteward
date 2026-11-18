/**
 * Webhook utilities — re-exported from @opensteward/shared.
 */
export { verifyHmacSha256, stripPrefix } from '@opensteward/shared'

export type { WebhookEvent } from './schema/webhook'

import type { WebhookEvent } from './schema/webhook'

export type WebhookHandler = {
  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean
  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[]
}

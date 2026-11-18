/**
 * Webhook utilities — re-exported from @opensteward/shared.
 */
export { verifyHmacSha256, stripPrefix } from '@opensteward/shared'
export type { WebhookHandler } from '@opensteward/shared'

// Re-export the logistics-specific WebhookEvent for adapter use
export type { WebhookEvent } from './schema/webhook'

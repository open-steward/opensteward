import crypto from 'node:crypto'
import type { WebhookEvent } from '../../schema/webhook'

export function verifyWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  const signature = headers['x-nutshell-signature'] ?? headers['X-Nutshell-Signature']
  if (!signature) return false
  const hash = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature))
  } catch {
    return false
  }
}

export function parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  return [
    {
      platform: 'nutshell',
      type: 'unknown',
      resourceType: 'unknown',
      action: 'unknown',
      resourceId: 'unknown',
      payload,
    },
  ]
}

export const nutshellWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyWebhook,
  parseWebhookEvents: parseWebhookEvents,
}

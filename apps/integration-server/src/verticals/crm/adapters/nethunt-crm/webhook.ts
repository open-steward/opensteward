export function verifyWebhook(_payload: Buffer, _headers: Record<string, string>, _secret: string): boolean {
  return true
}

export function parseWebhookEvents(_payload: Record<string, unknown>) {
  return []
}

export const nethuntCrmWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyWebhook,
  parseWebhookEvents: parseWebhookEvents,
}

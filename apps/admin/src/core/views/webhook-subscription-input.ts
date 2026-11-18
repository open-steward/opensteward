/**
 * The rules a webhook-subscription form field has to satisfy, in one place.
 *
 * /webhooks and wizard step 8 post the same fields to two different handlers.
 * Sharing the form markup (views/webhooks/_subscription-fields.ejs) without
 * sharing the validation would leave exactly that class of gap open — e.g.
 * one form accepting a plain-`http://` endpoint for signed payloads, on the
 * path a brand-new operator is most likely to take.
 *
 * These return a message rather than throwing: every caller renders it beside
 * the field the operator typed into, which is where a correction belongs.
 */
import { MAX_WEBHOOK_LABEL_LENGTH } from '@opensteward/shared'

export { MAX_WEBHOOK_LABEL_LENGTH }

export const WEBHOOK_FORMATS = ['opensteward', 'slack', 'teams', 'flat'] as const
export type WebhookFormat = (typeof WEBHOOK_FORMATS)[number]

/** The posted format, or null when it is not one this deployment renders. */
export function readWebhookFormat(raw: string | undefined): WebhookFormat | null {
  const value = (raw ?? 'opensteward').trim()
  return (WEBHOOK_FORMATS as readonly string[]).includes(value) ? (value as WebhookFormat) : null
}

/**
 * Enforces HTTPS so signed payloads are not sent in cleartext, allowing
 * `http://localhost` and `http://127.0.0.1` for local development only.
 * Returns null when the URL is acceptable.
 */
export function validateWebhookUrl(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return 'URL is not valid.'
  }
  const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
  if (parsed.protocol !== 'https:' && !isLocalhost) {
    return 'URL must use HTTPS (http is only allowed for localhost).'
  }
  return null
}

/** Returns null when the label fits, or the message to show when it does not. */
export function validateWebhookLabel(label: string): string | null {
  return label.length > MAX_WEBHOOK_LABEL_LENGTH
    ? `Label must be ${MAX_WEBHOOK_LABEL_LENGTH} characters or fewer.`
    : null
}

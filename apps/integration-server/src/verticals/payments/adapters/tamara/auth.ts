/**
 * Tamara authenticates every API call with the merchant API Token as a Bearer
 * token (`Authorization: Bearer <api-token>`). The token is issued from the
 * Tamara Partners Portal and is long-lived — there is no OAuth and no token
 * refresh.
 *
 * Tamara also issues a separate Notification Token used to verify inbound
 * webhooks (see `webhook.ts`). It is collected on the same form and stashed on
 * `credentials.extra.notificationToken` so the webhook verifier can reach it.
 *
 * Docs: https://docs.tamara.co/docs/api-token-management
 */
import type { Credentials } from '@opensteward/shared'

export const API_TOKEN_FIELD = 'apiToken'
export const NOTIFICATION_TOKEN_FIELD = 'notificationToken'

export function buildCredentials(fields: Record<string, string>): Credentials {
  const apiToken = (fields[API_TOKEN_FIELD] ?? '').trim()
  const notificationToken = (fields[NOTIFICATION_TOKEN_FIELD] ?? '').trim()
  return {
    accessToken: apiToken,
    extra: notificationToken ? { notificationToken } : {},
  }
}

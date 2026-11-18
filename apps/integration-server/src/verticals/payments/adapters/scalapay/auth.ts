/**
 * Scalapay authenticates every API call with the merchant API key as a Bearer
 * token (`Authorization: Bearer <api-key>`). Production keys are prefixed
 * `sp_`; the sandbox/integration key is issued separately. There is no OAuth
 * and no token refresh — the key is long-lived.
 *
 * The same api-key doubles as the webhook HMAC secret (see `webhook.ts`), so
 * we stash it on `credentials.extra.apiKey` as well as `accessToken`.
 *
 * Docs: https://developers.scalapay.com/reference/api-architecture
 */
import type { Credentials } from '@opensteward/shared'

export const API_KEY_FIELD = 'apiKey'

export function buildCredentials(fields: Record<string, string>): Credentials {
  const key = (fields[API_KEY_FIELD] ?? '').trim()
  return {
    accessToken: key,
    extra: { apiKey: key },
  }
}

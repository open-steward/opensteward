/**
 * Geidea authenticates server-to-server calls with HTTP Basic auth:
 *   username = merchant public key (a UUID issued in the Geidea portal)
 *   password = merchant API password
 *
 * Both are minted per-environment (test vs live) and per-region, so the key
 * pair itself selects the environment — there is no OAuth flow and no refresh
 * token. We stash the public key on `accessToken`, the API password and the
 * (optional) region on `extra`. The client base64-encodes the pair into the
 * `Authorization: Basic …` header; the API password is also the HMAC key used
 * to verify webhook signatures (see webhook.ts).
 *
 * Docs: https://docs.geidea.net/docs/pg-direct-api
 */
import type { Credentials } from '@opensteward/shared'

export function buildCredentials(fields: Record<string, string>): Credentials {
  const merchantPublicKey = (fields.merchantPublicKey ?? '').trim()
  const apiPassword = (fields.apiPassword ?? '').trim()
  if (!merchantPublicKey) throw new Error('Merchant public key is required.')
  if (!apiPassword) throw new Error('API password is required.')
  return {
    accessToken: merchantPublicKey,
    extra: {
      apiPassword,
      region: (fields.region ?? '').trim().toLowerCase() || 'default',
    },
  }
}

/** Read the merchant public key (Basic-auth username) off credentials. */
export function merchantPublicKey(credentials: Credentials): string {
  return credentials.accessToken ?? ''
}

/** Read the API password (Basic-auth password / webhook HMAC key) off credentials. */
export function apiPassword(credentials: Credentials): string {
  return String((credentials.extra as Record<string, unknown> | undefined)?.apiPassword ?? '')
}

/** Read the selected region ("ksa" | "default") off credentials. */
export function region(credentials: Credentials): string {
  return String((credentials.extra as Record<string, unknown> | undefined)?.region ?? 'default')
}

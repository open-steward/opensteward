/**
 * Computop Paygate uses HTTP Basic authentication for direct API access: the
 * merchant ID is the username and the API key is the password, combined as
 * `MerchantID:APIKey`, Base64-encoded, and sent as `Authorization: Basic …`.
 *
 * (Computop also offers an OAuth client-credentials flow that mints short-lived
 * JWTs, but Basic auth is the simplest direct-access path and is what the
 * `api_key` Connect Link form collects here.)
 *
 * Docs: https://computop-docs.redocly.app/authentication
 */
import type { Credentials } from '@opensteward/shared'

/**
 * Pack the merchant ID + API key into a single Basic-auth token stored on
 * `accessToken`. The client sends it verbatim as the `Basic` credential.
 */
export function buildBasicToken(merchantId: string, apiKey: string): string {
  return Buffer.from(`${merchantId}:${apiKey}`, 'utf8').toString('base64')
}

export function buildCredentials(fields: Record<string, string>): Credentials {
  const merchantId = (fields.merchantId ?? '').trim()
  const apiKey = (fields.apiKey ?? '').trim()
  if (!merchantId) throw new Error('Merchant ID is required.')
  if (!apiKey) throw new Error('API key is required.')
  return {
    accessToken: buildBasicToken(merchantId, apiKey),
    extra: { merchantId },
  }
}

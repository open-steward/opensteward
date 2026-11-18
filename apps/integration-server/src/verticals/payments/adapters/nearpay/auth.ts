import type { Credentials } from '@opensteward/shared'

/**
 * NearPay authenticates with an API key sent in an `api-key` header
 * ("The API key must be included in every request as an api-key header.",
 * https://docs.nearpay.io/sa/en/api-endpoints/banks-api; the Accounts API
 * Postman collection sends `{"key":"api-key","value":"{{api-key}}"}` on every
 * request). The key is stored as `accessToken` and the client sets the header.
 */
export function buildCredentials(fields: Record<string, string>): Credentials {
  const apiKey = fields.apiKey?.trim()
  if (!apiKey) throw new Error('NearPay requires an API key.')
  return { accessToken: apiKey }
}

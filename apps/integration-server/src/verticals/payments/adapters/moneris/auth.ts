import type { Credentials } from '@opensteward/shared'

/**
 * The Moneris API authenticates with an API key in the `X-Api-Key` header
 * (`ApiKeyAuth`: `"type": "apiKey", "in": "header", "name": "X-Api-Key"`), and
 * every request carries the merchant in `X-Merchant-Id` ("Thirteen character
 * identification code. … This code is provided by Moneris and is required to
 * identify the Merchant executing the transaction.", `"required": true`,
 * `"minLength": 13, "maxLength": 13`),
 * https://developer.moneris.com/moneris-api/reference/getcustomers.md.
 *
 * The key is stored as the access token and the merchant id in `extra`.
 */
export function buildCredentials(fields: Record<string, string>): Credentials {
  const apiKey = fields.apiKey?.trim()
  if (!apiKey) throw new Error('Moneris requires an API key (apiKey).')
  const merchantId = fields.merchantId?.trim()
  if (!merchantId || merchantId.length !== 13) {
    throw new Error('Moneris requires the 13-character Merchant ID (merchantId).')
  }
  return { accessToken: apiKey, extra: { merchantId } }
}

/** The connection's merchant id, or a 501 naming it when the connection predates it. */
export function merchantIdOf(credentials: Credentials): string {
  const id = credentials.extra?.merchantId
  if (typeof id === 'string' && id.length > 0) return id
  throw Object.assign(
    new Error(
      'Moneris requires the X-Merchant-Id header ("Thirteen character identification code") on ' +
        'every request, and this connection has no merchantId. Reconnect with the Merchant ID.',
    ),
    { statusCode: 501, code: 'NOT_SUPPORTED' },
  )
}

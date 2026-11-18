import type { Credentials } from '@opensteward/shared'

/**
 * Kushki authenticates every server call with the merchant's private key in
 * the `Private-Merchant-Id` header ("In your Kushki Console, this value is
 * labeled as **Private Key** and can be found within the **Credentials**
 * section.",
 * https://api-docs.kushkipagos.com/mexico/online-payments/analytics/transactions-list-v2.md).
 * The key is stored as the connection's access token.
 */
export function buildCredentials(fields: Record<string, string>): Credentials {
  const apiKey = fields.apiKey?.trim()
  if (!apiKey) throw new Error('Kushki requires the Private Key (apiKey).')
  return { accessToken: apiKey }
}

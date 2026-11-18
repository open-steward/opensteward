import type { Credentials, CredentialField } from '@opensteward/shared'

/**
 * Erplain issues a personal bearer token, not an OAuth grant.
 *
 * https://erplain.readme.io/v2.0/reference/setup: "Select your account's icon
 * in the top right corner, then select **Edit my profile**. [...] click on the
 * **Generate new token** button. You will then receive a **bearer token**."
 */
export function getAuthUrlUnsupported(): never {
  throw new Error('erplain uses a personal bearer token; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [{ name: 'apiKey', label: 'API Token', type: 'password', required: true }]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = fields['apiKey']
  if (!apiKey) throw new Error('erplain credentialFields require apiKey')
  return { accessToken: apiKey, extra: {} }
}

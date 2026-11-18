/**
 * Versa Cloud ERP authentication.
 *
 * Uses a long-lived API token obtained from Setup > Client Applications >
 * Become a Developer inside the Versa Cloud ERP UI.  The token is renewed
 * annually.  It is passed on every request as the VERSACCOUNTS_AUTHORIZATION
 * header.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('versa-cloud-erp uses an API key; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'apiKey',
      label: 'API Token',
      type: 'password',
      required: true,
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = fields['apiKey']
  if (!apiKey) throw new Error('versa-cloud-erp: apiKey is required')
  return { accessToken: apiKey }
}

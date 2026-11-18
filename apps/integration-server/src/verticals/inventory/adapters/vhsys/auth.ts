import type { Credentials, CredentialField } from '@opensteward/shared'

/**
 * VHSYS uses a static API key pair: access-token + secret-access-token.
 * Generate these from VHSYS back-office → App Store → Integração via API.
 * No OAuth2 flow — use credentialFields() instead.
 */
export function getAuthUrlUnsupported(): never {
  throw new Error('vhsys uses access-token + secret-access-token headers; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'accessToken', label: 'Access Token', type: 'password', required: true },
    { name: 'secretAccessToken', label: 'Secret Access Token', type: 'password', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const accessToken = fields['accessToken']
  const secretAccessToken = fields['secretAccessToken']
  if (!accessToken || !secretAccessToken)
    throw new Error('vhsys requires accessToken + secretAccessToken')
  return { accessToken, extra: { secretAccessToken } }
}

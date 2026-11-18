/**
 * Mabang ERP authentication.
 *
 * Auth model: api_key (developer key pair).
 *   - developerId  — numeric developer account ID issued by Mabang
 *   - developerKey — secret key used to sign each request body
 *
 * The signature is computed per-request in the client (see client.ts);
 * this module only handles credential collection + storage.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('mabang-erp uses a developer key pair; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'developerId', label: 'Developer ID', type: 'text', required: true },
    { name: 'developerKey', label: 'Developer Secret Key', type: 'password', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const developerId = fields['developerId']
  const developerKey = fields['developerKey']
  if (!developerId || !developerKey) {
    throw new Error('mabang-erp requires developerId and developerKey')
  }
  // Store the secret key as the accessToken; developerId goes in extra.
  return { accessToken: developerKey, extra: { developerId } }
}

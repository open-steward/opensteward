/**
 * Unthread auth — static API key.
 *
 * Service-account API keys are created in Unthread workspace settings
 * ("Workspace Settings > Service Accounts") or at the project level.
 * The key is passed in the X-Api-Key request header.
 *
 * Docs: https://docs.unthread.io/docs/api-docs/api-reference
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('unthread uses static API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'apiKey', label: 'API Key', type: 'password', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = fields['apiKey']
  if (!apiKey) throw new Error('unthread credentialFields require apiKey')
  return { accessToken: apiKey, extra: {} }
}

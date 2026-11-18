/**
 * ProjectManager API key authentication.
 *
 * ProjectManager uses API keys (Bearer tokens) that are generated within the
 * workspace by Admin or Global Admin users. The key is valid for two years and
 * is scoped to the workspace that created it.
 *
 * There is no OAuth flow; users supply their API key directly.
 *
 * Docs: https://developer.projectmanager.com/getting-started/authentication
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('projectmanager uses API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'apiKey',
      label: 'API Key',
      type: 'password',
      required: true,
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = fields['apiKey']
  if (!apiKey) throw new Error('projectmanager credentialFields require apiKey')
  return { accessToken: apiKey, extra: {} }
}

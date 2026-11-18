/**
 * GanttPRO uses static API-key auth.
 * Users generate keys at https://app.ganttpro.com/#/settings/integrations.
 * The key is sent as the `X-API-KEY` header on every request.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('ganttpro uses static API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'apiKey', label: 'API Key', type: 'password', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = fields['apiKey']
  if (!apiKey) throw new Error('ganttpro credentialFields require apiKey')
  return { accessToken: apiKey, extra: {} }
}

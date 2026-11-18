/**
 * LiveAgent auth — API key + subdomain model.
 *
 * Credentials are two fields:
 *  - apiKey      : the LiveAgent API key (sent as `apikey` header)
 *  - subdomain   : the tenant subdomain (e.g. `acme` for acme.ladesk.com)
 *
 * The API key is stored as `accessToken`; the subdomain goes into `extra`.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('liveagent uses static API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'subdomain',
      label: 'LiveAgent subdomain',
      type: 'text',
      required: true,
      helpText: 'The subdomain portion of your LiveAgent URL (e.g. `acme` if your instance is at `acme.ladesk.com`).',
    },
    {
      name: 'apiKey',
      label: 'API Key',
      type: 'password',
      required: true,
      helpText: 'Found in Configuration > System > API > API key.',
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const subdomain = fields['subdomain']?.trim()
  const apiKey = fields['apiKey']?.trim()
  if (!subdomain) throw new Error('liveagent credentialFields require subdomain')
  if (!apiKey) throw new Error('liveagent credentialFields require apiKey')
  return {
    accessToken: apiKey,
    extra: { subdomain },
  }
}

import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('ada-cx uses API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'apiKey',
      label: 'API Key',
      type: 'password',
      required: true,
      helpText: 'Your Ada organization-wide API key (Settings → Integrations → API).',
    },
    {
      name: 'botHandle',
      label: 'Bot Handle',
      type: 'text',
      required: true,
      helpText: 'The subdomain of your Ada bot URL (e.g. `acme` if your bot is at `acme.ada.support`).',
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = fields['apiKey']
  const botHandle = fields['botHandle']
  if (!apiKey) throw new Error('ada-cx: apiKey is required')
  if (!botHandle) throw new Error('ada-cx: botHandle is required')
  return {
    accessToken: apiKey,
    extra: { botHandle: botHandle.replace(/\.ada\.support$/, '').trim() },
  }
}

/**
 * Nuclino API key authentication.
 *
 * Nuclino authenticates via a raw API key passed directly in the
 * Authorization header — no Bearer prefix, no OAuth exchange.
 *
 * Docs: https://help.nuclino.com/8090bb76-authentication
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('nuclino uses API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'apiKey',
      label: 'API Key',
      type: 'password',
      placeholder: 'Your Nuclino API key',
      helpText: 'Find or create your API key in Nuclino → Account settings → API keys.',
      required: true,
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = (fields['apiKey'] ?? '').trim()
  if (!apiKey) throw new Error('Nuclino API key is required.')
  return { accessToken: apiKey }
}

/**
 * Zammad authentication — API Token (user access token).
 *
 * Zammad uses "Token token={value}" in the Authorization header.
 * Users create tokens in their Profile > Token Access screen.
 *
 * Because Zammad is self-hosted, the caller must also supply their instance
 * base URL (e.g. "https://support.example.com").
 *
 * Docs: https://docs.zammad.org/en/latest/api/intro.html
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('zammad uses static API token auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'baseUrl',
      label: 'Zammad base URL',
      type: 'text',
      required: true,
      helpText: 'The root URL of your Zammad instance, e.g. "https://support.example.com" (no trailing slash).',
    },
    {
      name: 'apiToken',
      label: 'API Token',
      type: 'password',
      required: true,
      helpText: 'A user access token created in Profile > Token Access. Requires ticket.agent (or admin) permission.',
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const baseUrl = (fields['baseUrl'] ?? '').replace(/\/+$/, '')
  const apiToken = fields['apiToken']
  if (!baseUrl) throw new Error('zammad credentialFields require baseUrl')
  if (!apiToken) throw new Error('zammad credentialFields require apiToken')
  return {
    accessToken: apiToken,
    extra: { baseUrl },
  }
}

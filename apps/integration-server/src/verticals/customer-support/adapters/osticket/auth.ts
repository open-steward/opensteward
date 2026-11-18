/**
 * osTicket auth — API key via X-API-Key header.
 *
 * Keys are created in the osTicket Admin Panel under Manage → API and are
 * optionally bound to a source IP address. The caller also supplies the
 * base URL of their self-hosted osTicket instance.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('osticket uses static API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'baseUrl',
      label: 'osTicket Base URL',
      type: 'text',
      required: true,
      // e.g. https://support.example.com  (no trailing slash)
    },
    {
      name: 'apiKey',
      label: 'API Key',
      type: 'password',
      required: true,
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const baseUrl = (fields['baseUrl'] ?? '').replace(/\/$/, '')
  const apiKey = fields['apiKey']
  if (!baseUrl) throw new Error('osticket credentialFields require baseUrl')
  if (!apiKey) throw new Error('osticket credentialFields require apiKey')
  return {
    accessToken: apiKey,
    extra: { baseUrl },
  }
}

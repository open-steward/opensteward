/**
 * GoFrugal RetailEasy authentication.
 *
 * GoFrugal uses a static API key supplied via the X-Auth-Token header.
 * Because the WebReporter service runs on-premises, customers must also
 * supply the base URL of their installation (e.g. http://10.0.0.5:8482/WebReporter).
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('gofrugal uses a static API key; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'baseUrl',
      label: 'Server URL',
      type: 'text',
      required: true,
      // e.g. http://192.168.1.100:8482/WebReporter
    },
    {
      name: 'apiKey',
      label: 'API Key (X-Auth-Token)',
      type: 'password',
      required: true,
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = fields['apiKey']
  if (!apiKey) throw new Error('gofrugal: apiKey is required')
  const baseUrl = (fields['baseUrl'] ?? '').replace(/\/+$/, '')
  if (!baseUrl) throw new Error('gofrugal: baseUrl (server URL) is required')
  return {
    accessToken: apiKey,
    extra: { baseUrl },
  }
}

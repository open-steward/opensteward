/**
 * Libredesk authentication.
 *
 * Libredesk is self-hosted. Each agent generates an API key + API secret in
 * Admin → Teammate → Agent → Edit.
 *
 * The API supports two auth schemes:
 *   - Basic:  Authorization: Basic <base64(apiKey:apiSecret)>
 *   - Token:  Authorization: token apiKey:apiSecret
 *
 * We store apiKey and apiSecret in Credentials.extra and build the Basic
 * header in the client.  The instance base URL is also stored in extra.baseUrl
 * so the client can construct absolute URLs at request time.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('libredesk uses static API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'baseUrl',
      label: 'Instance URL',
      type: 'text',
      required: true,
      helpText: 'The root URL of your Libredesk instance (e.g. https://support.acme.com).',
    },
    {
      name: 'apiKey',
      label: 'API Key',
      type: 'password',
      required: true,
      helpText: 'Found in Admin → Teammate → Agent → Edit → Generate API Key.',
    },
    {
      name: 'apiSecret',
      label: 'API Secret',
      type: 'password',
      required: true,
      helpText: 'Generated alongside the API Key.',
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const baseUrl = (fields['baseUrl'] ?? '').replace(/\/$/, '')
  const apiKey = fields['apiKey']
  const apiSecret = fields['apiSecret']
  if (!baseUrl) throw new Error('libredesk credentialFields require baseUrl')
  if (!apiKey) throw new Error('libredesk credentialFields require apiKey')
  if (!apiSecret) throw new Error('libredesk credentialFields require apiSecret')
  // accessToken carries the base64-encoded Basic auth credentials
  const accessToken = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')
  return { accessToken, extra: { baseUrl, apiKey, apiSecret } }
}

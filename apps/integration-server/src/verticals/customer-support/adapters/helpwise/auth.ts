/**
 * Helpwise authentication.
 *
 * Uses HTTP Basic auth with API Key + API Secret.
 * Credentials are obtained from the Helpwise Settings > Automation > API section.
 * The Authorization header is built as: Basic base64(apiKey:apiSecret)
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('helpwise uses static API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'apiKey',
      label: 'API Key',
      type: 'password',
      required: true,
      helpText: 'Found in Helpwise Settings > Automation > API > Generate Credentials.',
    },
    {
      name: 'apiSecret',
      label: 'API Secret',
      type: 'password',
      required: true,
      helpText: 'Found alongside the API Key in Helpwise Settings > Automation > API.',
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = fields['apiKey']
  const apiSecret = fields['apiSecret']
  if (!apiKey) throw new Error('helpwise credentialFields require apiKey')
  if (!apiSecret) throw new Error('helpwise credentialFields require apiSecret')
  // Store apiKey as accessToken; apiSecret in extra for Basic auth construction
  return {
    accessToken: apiKey,
    extra: { apiSecret },
  }
}

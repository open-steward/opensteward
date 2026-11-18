/**
 * Knowmax auth — static Bearer token.
 *
 * Tokens are generated inside the Knowmax admin console at:
 *   Admin > Company Settings > Generate Token
 *
 * The tenant is identified by its clientName (the slug that appears in the
 * URL https://app.knowmax.ai/<clientName>).
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('chatbot-knowmax uses static Bearer token auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'clientName',
      label: 'Client Name (tenant slug)',
      type: 'text',
      required: true,
      helpText:
        'The tenant slug in your Knowmax URL. For example, if your URL is https://app.knowmax.ai/acme, enter "acme".',
    },
    {
      name: 'apiToken',
      label: 'API Token',
      type: 'password',
      required: true,
      helpText: 'Bearer token generated at Admin > Company Settings > Generate Token inside Knowmax.',
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const clientName = fields['clientName']
  const apiToken = fields['apiToken']
  if (!clientName) throw new Error('chatbot-knowmax: clientName is required')
  if (!apiToken) throw new Error('chatbot-knowmax: apiToken is required')
  return {
    accessToken: apiToken,
    extra: { clientName },
  }
}

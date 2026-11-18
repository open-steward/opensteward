/**
 * Verloop.io authentication — static API key (auth_token) + client subdomain.
 *
 * The auth token is passed as a bare value in the Authorization header:
 *   Authorization: <auth_token>
 *
 * The client_id is the subdomain of the Verloop dashboard URL, e.g. if your
 * dashboard is https://acme.verloop.io the client_id is "acme".
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('verloop uses static API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'clientId',
      label: 'Client ID (subdomain)',
      type: 'text',
      required: true,
      helpText:
        'The subdomain portion of your Verloop dashboard URL. If your dashboard is https://acme.verloop.io, enter "acme".',
    },
    {
      name: 'apiKey',
      label: 'API Token',
      type: 'password',
      required: true,
      helpText:
        'Your Verloop API authorization token. Find it in the dashboard under your published campaign\'s API code.',
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const clientId = fields['clientId']
  const apiKey = fields['apiKey']
  if (!clientId) throw new Error('verloop credentialFields require clientId')
  if (!apiKey) throw new Error('verloop credentialFields require apiKey')
  return {
    accessToken: apiKey,
    extra: { clientId },
  }
}

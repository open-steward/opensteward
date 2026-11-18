/**
 * Helpshift auth — API key model.
 *
 * Helpshift uses HTTP Basic Auth with the API key as the username and an empty
 * password. Credentials are stored as accessToken = apiKey, with the domain
 * stored in extra.domain so the client can build per-tenant URLs.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('helpshift uses static API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'apiKey',
      label: 'API Key',
      type: 'password',
      required: true,
      helpText: 'Your Helpshift REST API key from Settings > APIs in the Helpshift dashboard.',
    },
    {
      name: 'domain',
      label: 'Helpshift Domain',
      type: 'text',
      required: true,
      helpText: 'Your Helpshift domain name (e.g. "acme" if your dashboard URL is acme.helpshift.com).',
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = fields['apiKey']
  const domain = fields['domain']
  if (!apiKey) throw new Error('helpshift credentialFields require apiKey')
  if (!domain) throw new Error('helpshift credentialFields require domain')
  return {
    accessToken: apiKey,
    extra: { domain },
  }
}

/**
 * Deskpro authentication — API key (static).
 *
 * Deskpro API keys take the form  "<id>:<secret>"  and are sent in the
 * Authorization header as  "key <id>:<secret>".
 *
 * Each customer also has their own helpdesk URL (e.g. https://acme.deskpro.com),
 * which is collected here so the client can build the correct base URL.
 *
 * Docs: https://deskpro.gitbook.io/dev-guide/api-basics/auth/api-keys
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('Deskpro uses static API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'instanceUrl',
      label: 'Deskpro Instance URL',
      type: 'text',
      required: true,
      helpText: 'The base URL of your Deskpro helpdesk (e.g. https://acme.deskpro.com).',
    },
    {
      name: 'apiKey',
      label: 'API Key',
      type: 'password',
      required: true,
      helpText: 'Your Deskpro API key in the format <id>:<secret> (e.g. 2:YWK2PGCS8CNW62SR8TBTBKWMY).',
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = fields['apiKey']
  const instanceUrl = fields['instanceUrl']
  if (!apiKey) throw new Error('Deskpro credentialFields require apiKey')
  if (!instanceUrl) throw new Error('Deskpro credentialFields require instanceUrl')
  return {
    accessToken: apiKey,
    extra: { instanceUrl: instanceUrl.replace(/\/$/, '') },
  }
}

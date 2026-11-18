/**
 * Frappe Helpdesk auth — API Key + API Secret token model.
 *
 * Frappe uses a concatenated token:  Authorization: token <api_key>:<api_secret>
 *
 * The token is user-scoped: go to User list → Settings tab → API Access →
 * Generate Keys to obtain api_key and api_secret.
 *
 * siteUrl is the base URL of the customer's Frappe site
 * (e.g. https://support.example.com).
 *
 * Docs: https://docs.frappe.io/framework/user/en/guides/integration/rest_api/token_based_authentication
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('Frappe Helpdesk uses API Key + Secret auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'siteUrl',
      label: 'Site URL',
      type: 'text',
      required: true,
      helpText: 'Base URL of your Frappe Helpdesk site (e.g. https://support.example.com). No trailing slash.',
    },
    {
      name: 'apiKey',
      label: 'API Key',
      type: 'text',
      required: true,
      helpText: 'API Key from User → Settings → API Access → Generate Keys.',
    },
    {
      name: 'apiSecret',
      label: 'API Secret',
      type: 'password',
      required: true,
      helpText: 'API Secret generated alongside the API Key.',
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const siteUrl = fields['siteUrl']?.replace(/\/$/, '')
  const apiKey = fields['apiKey']
  const apiSecret = fields['apiSecret']
  if (!siteUrl)   throw new Error('frappe-helpdesk credentialFields require siteUrl')
  if (!apiKey)    throw new Error('frappe-helpdesk credentialFields require apiKey')
  if (!apiSecret) throw new Error('frappe-helpdesk credentialFields require apiSecret')

  // Store the combined token string as accessToken for header injection in client.ts
  return {
    accessToken: `${apiKey}:${apiSecret}`,
    extra: { siteUrl },
  }
}

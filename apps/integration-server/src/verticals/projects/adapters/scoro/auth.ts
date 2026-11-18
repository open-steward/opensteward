/**
 * Scoro auth — static API key.
 *
 * Scoro authenticates via an `apiKey` (company-level) passed in every
 * POST body alongside `company_account_id` (the subdomain slug).
 * There is no OAuth flow.
 *
 * Credentials stored:
 *   accessToken  = the raw API key string
 *   extra.companyAccountId = the company subdomain (e.g. "acme")
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('Scoro uses static API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'apiKey',
      label: 'API Key',
      type: 'password',
      required: true,
    },
    {
      name: 'companyAccountId',
      label: 'Company Account ID (subdomain)',
      type: 'text',
      required: true,
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = fields['apiKey']
  const companyAccountId = fields['companyAccountId']
  if (!apiKey) throw new Error('Scoro credentialFields require apiKey')
  if (!companyAccountId) throw new Error('Scoro credentialFields require companyAccountId')
  return {
    accessToken: apiKey,
    extra: { companyAccountId },
  }
}

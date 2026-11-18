/**
 * SnapEngage auth — static API-token model.
 *
 * Tokens are generated in Admin Dashboard → My Account → API Token.
 * The orgId (organisation identifier) is also shown on that page and
 * must be supplied alongside the token.
 *
 * Wire header: Authorization: <api_token>  (no "Bearer" prefix)
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('SnapEngage uses static API-key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'apiToken',
      label: 'API Token',
      type: 'password',
      required: true,
      helpText: 'Generate in Admin Dashboard → My Account → API Token.',
    },
    {
      name: 'orgId',
      label: 'Organisation ID',
      type: 'text',
      required: true,
      helpText: 'Found on the same API Token page in the Admin Dashboard.',
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiToken = fields['apiToken']
  const orgId = fields['orgId']
  if (!apiToken) throw new Error('SnapEngage credentialFields require apiToken')
  if (!orgId) throw new Error('SnapEngage credentialFields require orgId')
  return { accessToken: apiToken, extra: { orgId } }
}

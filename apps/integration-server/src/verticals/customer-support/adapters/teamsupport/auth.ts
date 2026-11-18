/**
 * TeamSupport authentication.
 *
 * TeamSupport uses HTTP Basic Auth: the OrganizationID as the username
 * and the APIToken as the password. Both are obtained from the TeamSupport
 * admin panel under Admin > API.
 *
 * The adapter stores these as:
 *   credentials.extra.orgId       — the OrganizationID
 *   credentials.accessToken        — the APIToken
 *
 * The Basic auth header is built in the client from both fields.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('teamsupport uses static API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'orgId',
      label: 'Organization ID',
      type: 'text',
      required: true,
      helpText: 'Your TeamSupport Organization ID, found under Admin > API.',
    },
    {
      name: 'apiToken',
      label: 'API Token',
      type: 'password',
      required: true,
      helpText: 'Your TeamSupport API Token, found under Admin > API.',
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const orgId = fields['orgId']
  const apiToken = fields['apiToken']
  if (!orgId) throw new Error('teamsupport credentialFields require orgId')
  if (!apiToken) throw new Error('teamsupport credentialFields require apiToken')
  return {
    accessToken: apiToken,
    extra: { orgId },
  }
}

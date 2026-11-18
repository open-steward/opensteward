/**
 * Concord authenticates with an API key, never OAuth
 * (https://api.doc.concordnow.com/concord-openapi-bundled.yaml):
 *   "Users authenticate themselves through the HTTP Header **X-API-KEY**.
 *    You can generate as many API Keys as needed from your Concord account."
 * The spec's only security scheme is `ApiKeyAuthentication` (type apiKey,
 * in header, name X-API-KEY).
 *
 * Every agreement path carries an `organizationId` ("Organization ID",
 * integer int64), which the key does not imply: a user can belong to several
 * organizations (GET /user/me/organizations). The connection names it.
 *
 * The key is stored as `accessToken` (the secret the credential store
 * encrypts and the pager fingerprints), the organization in
 * `extra.organizationId`.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'apiKey',
      label: 'API key',
      type: 'password',
      required: true,
      helpText: 'Sent as the X-API-KEY header.',
    },
    {
      name: 'organizationId',
      label: 'Organization ID',
      type: 'text',
      required: true,
      helpText: 'The numeric Concord organization whose agreements are read.',
    },
  ]
}

function parseOrganizationId(value: unknown): string | undefined {
  const text =
    typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : ''
  return /^\d+$/.test(text) ? text : undefined
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = fields['apiKey']?.trim()
  const organizationId = parseOrganizationId(fields['organizationId'])
  if (!apiKey) throw new Error('concord credentialFields require apiKey')
  if (!organizationId) {
    throw new Error('concord credentialFields require a numeric organizationId')
  }
  return { accessToken: apiKey, extra: { organizationId } }
}

/**
 * The connection's organization id; throws when it is missing. It was checked
 * to be numeric when the connection was made (exchangeCredentials); here it is
 * only required, and path-encoded by the caller.
 */
export function concordOrganizationId(credentials: Credentials): string {
  const raw = credentials.extra?.['organizationId']
  const organizationId =
    typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw.trim() : ''
  if (!organizationId) {
    throw new Error(
      'concord credentials lack an organizationId; reconnect with apiKey and organizationId',
    )
  }
  return organizationId
}

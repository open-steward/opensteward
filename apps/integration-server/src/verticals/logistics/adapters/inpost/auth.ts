/**
 * InPost ShipX authentication.
 *
 * ShipX has no token endpoint. "All requests which are sent to the server
 * requires passing a valid access token, which belongs to the owner of the
 * organization. The access token should be provided in the header
 * Authorization. The organization ID should be passed in Path Parameters"
 * (https://dokumentacja-inpost.atlassian.net/wiki/spaces/PL/pages/18153477/),
 * with the example header `Authorization: Bearer W-TYM-MIEJSCU-NALEZY-UMIESCIC-TOKEN`.
 * Both the token and the organization id are generated in Parcel Manager.
 */
import type { CredentialField, Credentials } from '@opensteward/shared'
import { customForm } from '@opensteward/shared'
import { INPOST_ACCESS_HELP } from './constants'

const FORM = customForm({
  fields: [
    {
      name: 'apiToken',
      label: 'ShipX API token',
      type: 'password',
      helpText: INPOST_ACCESS_HELP,
      required: true,
    },
    {
      name: 'organizationId',
      label: 'Organization ID',
      type: 'text',
      helpText: INPOST_ACCESS_HELP,
      required: true,
    },
  ],
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const apiToken = (fields?.['apiToken'] ?? '').trim()
    const organizationId = (fields?.['organizationId'] ?? '').trim()
    if (!apiToken) throw new Error('ShipX API token is required.')
    if (!organizationId) throw new Error('Organization ID is required.')
    return { accessToken: apiToken, extra: { organizationId } }
  },
})

export function credentialFields(): CredentialField[] {
  return FORM.credentialFields()
}

export function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  return FORM.exchangeCredentials(fields)
}

/**
 * The connection's organization id. Organization-scoped lists need it in the
 * path, so a connection without one is refused before any request is sent.
 */
export function organizationId(credentials: Credentials, what: string): string {
  const raw = credentials.extra?.['organizationId']
  const id = typeof raw === 'string' || typeof raw === 'number' ? String(raw).trim() : ''
  if (!id) {
    throw Object.assign(
      new Error(
        `InPost cannot list ${what} without an organization id: ShipX takes it in the path ` +
          '(GET /v1/organizations/:organization_id/...). Reconnect with your Organization ID.',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }
  return id
}

export function authHeader(accessToken: string): string {
  return `Bearer ${accessToken}`
}

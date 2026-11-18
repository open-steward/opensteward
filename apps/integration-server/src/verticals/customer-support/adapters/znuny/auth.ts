/**
 * Znuny credential model.
 *
 * Znuny is self-hosted; every tenant runs their own instance. Credentials
 * therefore include the instance URL in addition to agent login/password.
 * There is no OAuth flow — credentials are exchanged once and stored as-is.
 *
 * The "api_key" model is implemented here as a UserLogin + Password pair that
 * is stored in the Credentials.extra map alongside the instanceUrl. The
 * accessToken field is left empty (unused) because Znuny REST auth passes
 * credentials per-request in the request body / query string.
 *
 * Docs: https://itgovernanceportal.com/znuny/rest-api-authenticate-znuny-otrs/
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('znuny uses static credential auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'instanceUrl',
      label: 'Instance URL',
      type: 'text',
      required: true,
      // e.g. https://helpdesk.example.com
    },
    {
      name: 'userLogin',
      label: 'Agent Username',
      type: 'text',
      required: true,
    },
    {
      name: 'password',
      label: 'Agent Password',
      type: 'password',
      required: true,
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const instanceUrl = fields['instanceUrl']?.replace(/\/+$/, '')
  const userLogin = fields['userLogin']
  const password = fields['password']

  if (!instanceUrl) throw new Error('znuny credentials require instanceUrl')
  if (!userLogin) throw new Error('znuny credentials require userLogin')
  if (!password) throw new Error('znuny credentials require password')

  return {
    // accessToken is unused; auth params are injected per-request in client.ts
    accessToken: '',
    extra: { instanceUrl, userLogin, password },
  }
}

/**
 * Crunchtime auth.
 *
 * Crunchtime does NOT use a standard OAuth2 PKCE / authorization-code flow.
 * Access is provisioned via:
 *   - authenticationtoken  — issued by Crunchtime support per environment
 *   - sitename             — the subdomain of the customer's net-chef.com URL
 *   - userid               — Crunchtime Application User ID
 *   - password             — Crunchtime Application User password
 *
 * All four values are stored in credentials.extra; accessToken holds the
 * authenticationtoken as a human-legible primary key.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error(
    'crunchtime uses provisioned token + site credentials; use credentialFields() instead',
  )
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'authenticationtoken',
      label: 'Authentication Token',
      type: 'password',
      required: true,
    },
    { name: 'sitename', label: 'Site Name', type: 'text', required: true },
    { name: 'userid', label: 'Application User ID', type: 'text', required: true },
    { name: 'password', label: 'Application User Password', type: 'password', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const token = fields['authenticationtoken']
  const sitename = fields['sitename']
  const userid = fields['userid']
  const password = fields['password']
  if (!token || !sitename || !userid || !password) {
    throw new Error(
      'crunchtime requires authenticationtoken, sitename, userid, and password',
    )
  }
  return {
    accessToken: token,
    extra: { sitename, userid, password },
  }
}

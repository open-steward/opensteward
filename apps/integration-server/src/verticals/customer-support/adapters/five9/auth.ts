/**
 * Five9 auth — static Bearer token (api_key model).
 *
 * The token is generated in the Five9 Admin console under
 * Admin > Identity > SCIM Settings. It is long-lived and must be
 * manually regenerated if compromised. No OAuth flow is involved.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('five9 uses a static Bearer token (SCIM API key); use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'apiKey',
      label: 'SCIM Bearer Token',
      type: 'password',
      required: true,
      helpText:
        'Generate this token in the Five9 Admin console under Admin > Identity > SCIM Settings. Requires Enterprise plan (Optimum/Ultimate tier) with SAML 2.0 SSO enabled.',
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = fields['apiKey']
  if (!apiKey) throw new Error('five9 requires an apiKey (SCIM Bearer token)')
  return { accessToken: apiKey, extra: {} }
}

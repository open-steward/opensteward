/**
 * Jitbit Helpdesk auth.
 *
 * Jitbit supports two auth mechanisms:
 *   1. Bearer token  — obtained from /User/Token, stored as accessToken.
 *   2. HTTP Basic    — username:password base64 encoded.
 *
 * We expose three credential fields so the user can supply:
 *   • apiToken  — the bearer token (preferred, expires only on password change)
 *   • OR username + password  (converted to Basic auth header at request time)
 *   • baseUrl   — full SaaS URL prefix or self-hosted URL up to and including /api
 *
 * accessToken carries the raw token value; extra.authScheme='Bearer'|'Basic'.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('jitbit-helpdesk uses token/password auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'baseUrl',
      label: 'Helpdesk Base URL',
      type: 'text',
      required: true,
      helpText:
        'Full URL up to and including /api, e.g. https://acme.jitbit.com/helpdesk/api or https://support.acme.com/api',
    },
    {
      name: 'apiToken',
      label: 'API Token',
      type: 'password',
      required: false,
      helpText: 'Bearer token from your Jitbit profile (/User/Token). Preferred over username/password.',
    },
    {
      name: 'username',
      label: 'Username',
      type: 'text',
      required: false,
      helpText: 'Username for Basic auth (only if API Token is not provided).',
    },
    {
      name: 'password',
      label: 'Password',
      type: 'password',
      required: false,
      helpText: 'Password for Basic auth (only if API Token is not provided).',
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const baseUrl = fields['baseUrl']?.trim()
  if (!baseUrl) throw new Error('jitbit-helpdesk credentialFields require baseUrl')

  const apiToken = fields['apiToken']?.trim()
  if (apiToken) {
    return {
      accessToken: apiToken,
      extra: { authScheme: 'Bearer', baseUrl },
    }
  }

  const username = fields['username']?.trim()
  const password = fields['password'] ?? ''
  if (username) {
    const encoded = Buffer.from(`${username}:${password}`).toString('base64')
    return {
      accessToken: encoded,
      extra: { authScheme: 'Basic', baseUrl },
    }
  }

  throw new Error('jitbit-helpdesk: provide either apiToken or username+password')
}

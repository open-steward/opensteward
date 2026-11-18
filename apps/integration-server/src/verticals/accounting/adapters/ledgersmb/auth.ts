/**
 * LedgerSMB authentication — local username/password/company session.
 *
 * LedgerSMB is self-hosted and uses session-cookie auth.
 * The customer supplies: instance root URL, company (database name), username, password.
 *
 * Authentication endpoint:
 *   POST {instanceUrl}/login.pl?__action=authenticate&company={company}
 *   Content-Type: application/json
 *   X-Requested-With: XMLHttpRequest
 *   Body: { company, login, password }
 *
 * On success the server sets a `LedgerSMB` cookie containing the session token.
 * We store that token as `accessToken` and the connection parameters in `extra`
 * so we can re-authenticate when the session expires.
 *
 * Docs: https://book.ledgersmb.org/dev/full-book/
 */

import axios from 'axios'
import type { Credentials } from '../../adapter/interface'
import type { CredentialField } from '@opensteward/shared'
import { LEDGERSMB_AUTH_PATH } from './constants'

export const LEDGERSMB_CREDENTIAL_FIELDS: CredentialField[] = [
  {
    name: 'instanceUrl',
    label: 'Instance URL',
    type: 'url',
    placeholder: 'https://accounting.example.com',
    helpText: 'The root URL of your LedgerSMB installation (no trailing slash).',
    required: true,
  },
  {
    name: 'company',
    label: 'Company (database name)',
    type: 'text',
    placeholder: 'mycompany',
    helpText: 'The LedgerSMB company/database name you log in to.',
    required: true,
  },
  {
    name: 'username',
    label: 'Username',
    type: 'text',
    placeholder: 'admin',
    required: true,
  },
  {
    name: 'password',
    label: 'Password',
    type: 'password',
    required: true,
  },
]

/**
 * Exchange submitted form fields for a LedgerSMB session credential.
 *
 * Stores:
 *   accessToken          — the session cookie value
 *   extra.instanceUrl    — self-hosted instance root URL
 *   extra.company        — company/database name
 *   extra.username       — stored for re-authentication
 *   extra.password       — stored for re-authentication
 */
export async function exchangeCredentials(
  fields: Record<string, string>,
): Promise<Credentials> {
  const instanceUrl = (fields['instanceUrl'] ?? '').replace(/\/+$/, '')
  const company = (fields['company'] ?? '').trim()
  const username = (fields['username'] ?? '').trim()
  const password = fields['password'] ?? ''

  if (!instanceUrl) throw new Error('Instance URL is required.')
  if (!company) throw new Error('Company is required.')
  if (!username) throw new Error('Username is required.')
  if (!password) throw new Error('Password is required.')

  const authUrl = `${instanceUrl}/${LEDGERSMB_AUTH_PATH}?__action=authenticate&company=${encodeURIComponent(company)}`

  const response = await axios.post<unknown>(
    authUrl,
    { company, login: username, password },
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      withCredentials: false,
      validateStatus: (s) => s < 500,
    },
  )

  if (response.status === 401 || response.status === 403) {
    throw new Error('LedgerSMB authentication failed: invalid credentials.')
  }
  if (response.status >= 400) {
    throw new Error(`LedgerSMB authentication failed with HTTP ${response.status}.`)
  }

  // Extract the session cookie value from Set-Cookie header
  const setCookie = (response.headers['set-cookie'] as string[] | string | undefined) ?? []
  const cookieHeader = Array.isArray(setCookie) ? setCookie.join('; ') : String(setCookie)
  const match = cookieHeader.match(/LedgerSMB=([^;]+)/)
  const sessionCookie = match ? match[1] : undefined

  if (!sessionCookie) {
    throw new Error(
      'LedgerSMB authentication succeeded but no session cookie was returned. ' +
        'Ensure the instance URL and company name are correct.',
    )
  }

  return {
    accessToken: sessionCookie,
    extra: {
      instanceUrl,
      company,
      username,
      password,
    },
  }
}

/**
 * Re-authenticate to obtain a fresh session cookie.
 * LedgerSMB sessions expire; re-login using the credentials stored in `extra`.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const extra = credentials.extra as Record<string, string> | undefined
  if (!extra?.instanceUrl || !extra?.company || !extra?.username || !extra?.password) {
    throw new Error(
      'Cannot refresh LedgerSMB credentials: stored connection fields are missing. ' +
        'Please re-connect the integration.',
    )
  }
  return exchangeCredentials({
    instanceUrl: extra.instanceUrl,
    company: extra.company,
    username: extra.username,
    password: extra.password,
  })
}

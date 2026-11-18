/**
 * Fluent Commerce OAuth 2.0 — password grant via FLUENT_INTEGRATION client.
 *
 * Fluent does NOT use a standard OAuth redirect flow. Instead, it uses a
 * resource-owner password grant: client_id=FLUENT_INTEGRATION plus the
 * operator's username and password. Access tokens are short-lived (~30 min);
 * a refresh_token is issued and should be stored.
 *
 * There is no redirect, so the Connect page collects these through
 * credentialFields() — which it renders for `basic`, not `oauth2`.
 *
 * Credential fields collected from the operator:
 *   - accountId   : account ID (e.g. "ACME" → ACME.api.fluentretail.com), or a pasted API host
 *   - env         : "production" (default) or "sandbox" (→ ACME.sandbox.api.fluentretail.com)
 *   - username    : Fluent integration user email
 *   - password    : Fluent integration user password
 *   - clientSecret: OAuth client secret from Fluent
 */
import type { Credentials, CredentialField } from '@opensteward/shared'
import {
  fluentApiHost,
  normaliseFluentAccount,
  OAUTH_CLIENT_ID,
  OAUTH_SCOPE,
  type FluentAccount,
} from './constants'

function tokenUrl(account: FluentAccount): string {
  return `https://${fluentApiHost(account)}/oauth/token`
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'accountId',
      label: 'Account ID',
      type: 'text',
      placeholder: 'ACME',
      helpText: 'Your Fluent account ID, or paste your API host (e.g. ACME.sandbox.api.fluentretail.com).',
      required: true,
    },
    {
      name: 'env',
      label: 'Environment',
      type: 'select',
      options: [
        { value: 'production', label: 'Production' },
        { value: 'sandbox', label: 'Sandbox' },
      ],
      required: false,
    },
    {
      name: 'username',
      label: 'Integration User Email',
      type: 'email',
      placeholder: 'integration@acme.com',
      required: true,
    },
    {
      name: 'password',
      label: 'Integration User Password',
      type: 'password',
      required: true,
    },
    {
      name: 'clientSecret',
      label: 'OAuth Client Secret',
      type: 'password',
      helpText: 'Client secret for the FLUENT_INTEGRATION application provided by Fluent.',
      required: true,
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const account = normaliseFluentAccount(fields['accountId'], fields['env'])
  const username = fields['username']?.trim()
  const password = fields['password']
  const clientSecret = fields['clientSecret']
  if (!username || !password || !clientSecret) {
    throw new Error('Integration user email, password and client secret are required.')
  }

  const res = await fetch(tokenUrl(account), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'fluent.account': account.accountId,
    },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: OAUTH_CLIENT_ID,
      client_secret: clientSecret,
      username,
      password,
      scope: OAUTH_SCOPE,
    }).toString(),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`fluent-commerce token exchange failed (${res.status}): ${text}`)
  }

  const json = await res.json() as {
    access_token: string
    refresh_token?: string
    expires_in?: number
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000)
      : undefined,
    extra: { accountId: account.accountId, env: account.env, clientSecret },
  }
}

/** getAuthUrl is not applicable — Fluent uses password grant, not authorization-code redirect. */
export function getAuthUrl(_state: string): never {
  throw new Error(
    'fluent-commerce uses OAuth2 password grant; use credentialFields() + exchangeCredentials() instead of getAuthUrl()',
  )
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  if (!credentials.refreshToken) return credentials
  const account = normaliseFluentAccount(credentials.extra?.['accountId'], credentials.extra?.['env'])
  const clientSecret = String(credentials.extra?.['clientSecret'] ?? '')
  if (!clientSecret) return credentials

  const res = await fetch(tokenUrl(account), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'fluent.account': account.accountId,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: OAUTH_CLIENT_ID,
      client_secret: clientSecret,
      refresh_token: credentials.refreshToken,
      scope: OAUTH_SCOPE,
    }).toString(),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`fluent-commerce token refresh failed (${res.status}): ${text}`)
  }

  const json = await res.json() as {
    access_token: string
    refresh_token?: string
    expires_in?: number
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? credentials.refreshToken,
    expiresAt: json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000)
      : undefined,
    extra: credentials.extra,
  }
}

/**
 * Revel Systems OAuth2 — client_credentials grant.
 *
 * Token URL:  https://authentication.revelup.com/oauth/token
 * Grant type: client_credentials
 * Audience:   https://api.revelsystems.com
 *
 * No user-facing authorization page — pure machine-to-machine flow, so the
 * Connect page collects these via credentialFields() (rendered for
 * `oauth2_cc`, not `oauth2`). The merchant's subdomain is normalised, held to
 * revelup.com, and stored in credentials.extra so client.ts can build
 * per-merchant resource URLs.
 *
 * Tokens last ~24 h. We proactively refresh within TOKEN_REFRESH_BUFFER_MS.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'
import { TOKEN_URL, TOKEN_AUDIENCE, TOKEN_REFRESH_BUFFER_MS } from './constants'

const SUBDOMAIN_LABEL = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/

/**
 * Reduce what a merchant typed — `mystore`, `mystore.revelup.com`,
 * `https://mystore.revelup.com/resources/` — to the bare lower-case subdomain.
 * Rejects blanks and anything outside revelup.com (including look-alikes such
 * as `mystore.revelup.com.evil.example`), because the bearer token is sent to
 * `{subdomain}.revelup.com`.
 */
export function normaliseRevelSubdomain(raw: unknown): string {
  const s = (typeof raw === 'string' ? raw : '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[/?#].*$/, '')
  if (!s) throw new Error('Revel subdomain is required (e.g. mystore or mystore.revelup.com).')
  const outside = () => new Error('Revel subdomain must be a *.revelup.com host.')
  if (s.includes('.') && !s.endsWith('.revelup.com')) throw outside()
  const sub = s.replace(/\.revelup\.com$/, '')
  if (!SUBDOMAIN_LABEL.test(sub)) throw outside()
  return sub
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'clientId', label: 'Client ID', type: 'text', required: true },
    { name: 'clientSecret', label: 'Client Secret', type: 'password', required: true },
    {
      name: 'subdomain',
      label: 'Revel subdomain',
      type: 'text',
      placeholder: 'mystore',
      helpText: 'The part before .revelup.com in your Revel URL. A pasted https:// URL is accepted.',
      required: true,
    },
  ]
}

/** Revel uses client_credentials; there is no user-facing authorization URL. */
export function getAuthUrl(_state: string): never {
  throw new Error(
    'revel-systems uses client_credentials OAuth2; call credentialFields() + exchangeCredentials() instead',
  )
}

/** Exchange client_id + client_secret for a bearer token. */
export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const subdomain = normaliseRevelSubdomain(fields['subdomain'])
  const clientId = (fields['clientId'] ?? '').trim()
  const clientSecret = fields['clientSecret'] ?? ''
  if (!clientId || !clientSecret) throw new Error('Client ID and client secret are required.')
  return fetchToken({ clientId, clientSecret, subdomain })
}

/** Refresh by re-issuing a new client_credentials token. */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const extra = (credentials.extra ?? {}) as Record<string, string>
  const subdomain = normaliseRevelSubdomain(extra['subdomain'])
  const clientId = extra['clientId']
  const clientSecret = extra['clientSecret']
  if (!clientId || !clientSecret) {
    throw new Error('revel-systems: cannot refresh — missing clientId/clientSecret in credentials.extra')
  }
  return fetchToken({ clientId, clientSecret, subdomain })
}

export function isTokenExpired(credentials: Credentials): boolean {
  if (!credentials.expiresAt) return false
  return credentials.expiresAt.getTime() - Date.now() < TOKEN_REFRESH_BUFFER_MS
}

export async function ensureAuth(credentials: Credentials): Promise<Credentials> {
  if (!isTokenExpired(credentials)) return credentials
  return refreshCredentials(credentials)
}

// ── internal ──────────────────────────────────────────────────────────────────

async function fetchToken(opts: {
  clientId: string
  clientSecret: string
  subdomain: string
}): Promise<Credentials> {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    audience: TOKEN_AUDIENCE,
  })

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`revel-systems token request failed (${res.status}): ${text}`)
  }

  const json = (await res.json()) as {
    access_token: string
    token_type: string
    expires_in?: number
  }

  return {
    accessToken: json.access_token,
    // Default to 24 h if expires_in is absent (per Revel docs).
    expiresAt: new Date(Date.now() + (json.expires_in ?? 86_400) * 1000),
    extra: {
      clientId: opts.clientId,
      clientSecret: opts.clientSecret,
      subdomain: opts.subdomain,
    },
  }
}

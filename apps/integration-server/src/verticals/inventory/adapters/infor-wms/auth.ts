/**
 * Infor WMS auth — OAuth 2.0 Resource Owner Password Credentials (ROPC) flow
 * via the Infor ION API Gateway.
 *
 * Infor CloudSuite WMS customers obtain a service account credential file
 * (.ionapi) that contains all the pieces needed to request an access token:
 *
 *   iu  — ION API URL (used as the REST base: {iu}/{ti}/WMS)
 *   ti  — Tenant identifier
 *   pu  — Portal URL (auth server base)
 *   ot  — OAuth token path (appended to pu to form the token endpoint)
 *   ci  — OAuth client ID
 *   cs  — OAuth client secret
 *   saak — Service account application key (username)
 *   sask — Service account secret key (password)
 *
 * Token request (POST {pu}/{ot}, application/x-www-form-urlencoded):
 *   grant_type=password
 *   client_id={ci}
 *   client_secret={cs}
 *   username={saak}
 *   password={sask}
 *   scope=infor.wms.all (or blank — scope is implicit for service accounts)
 *
 * Tokens expire in ~2 h by default; this module re-requests on refresh.
 *
 * There is no browser redirect, so the Connect page collects the .ionapi values
 * through credentialFields() — which it renders for `basic`, not `oauth2`.
 */
import type { CredentialField, Credentials } from '@opensteward/shared'
import { assertPublicHost, customForm } from '@opensteward/shared'

// ── Customer-supplied URL validation ─────────────────────────────────────────
//
// The token URL receives the client secret and service-account password, and
// the ION API URL receives every bearer token. Both are free-form (Infor cloud
// or a self-hosted gateway), so each is normalised, must be https, and must
// resolve to a public address before any request is sent to it.

const TENANT_ID = /^[A-Za-z0-9_-]+$/

function parseHttpsUrl(raw: unknown, label: string): URL {
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (!value) throw new Error(`${label} is required.`)
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    throw new Error(`${label} is not a valid URL.`)
  }
  if (url.protocol !== 'https:') throw new Error(`${label} must use https.`)
  if (url.username || url.password) throw new Error(`${label} must not contain credentials.`)
  if (!url.hostname.includes('.')) throw new Error(`${label} is not a valid URL.`)
  return url
}

/** `iu` from the .ionapi file → origin + path without trailing slash. */
export function normaliseIonApiUrl(raw: unknown): string {
  const url = parseHttpsUrl(raw, 'Infor ION API URL')
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`
}

/** `pu` + `ot` from the .ionapi file → origin + path (query and fragment dropped). */
export function normaliseInforTokenUrl(raw: unknown): string {
  const url = parseHttpsUrl(raw, 'Infor OAuth token URL')
  return `${url.origin}${url.pathname}`
}

/** `ti` from the .ionapi file — a path segment of every API request. */
export function normaliseInforTenantId(raw: unknown): string {
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (!value) throw new Error('Infor tenant ID is required.')
  if (!TENANT_ID.test(value)) {
    throw new Error('Infor tenant ID must be a single path segment (e.g. ACME_PRD).')
  }
  return value
}

// ── Credential form fields ───────────────────────────────────────────────────

const FIELDS: CredentialField[] = [
  {
    name: 'ionApiUrl',
    label: 'ION API URL',
    type: 'url',
    placeholder: 'https://mingle.inforcloudsuite.com',
    helpText: 'The "iu" value from your .ionapi credential file (no trailing slash).',
    required: true,
  },
  {
    name: 'tenantId',
    label: 'Tenant ID',
    type: 'text',
    placeholder: 'ACME_PRD',
    helpText: 'The "ti" value from your .ionapi file (your Infor environment identifier).',
    required: true,
  },
  {
    name: 'tokenUrl',
    label: 'OAuth Token URL',
    type: 'url',
    placeholder: 'https://mingle.inforcloudsuite.com/ACME_PRD/as/token',
    helpText: 'Concatenate "pu" + "/" + "ot" from your .ionapi file.',
    required: true,
  },
  {
    name: 'clientId',
    label: 'Client ID',
    type: 'text',
    helpText: 'The "ci" value from your .ionapi file.',
    required: true,
  },
  {
    name: 'clientSecret',
    label: 'Client Secret',
    type: 'password',
    helpText: 'The "cs" value from your .ionapi file.',
    required: true,
  },
  {
    name: 'serviceAccountKey',
    label: 'Service Account Key (saak)',
    type: 'text',
    helpText: 'The "saak" value from your .ionapi file — used as the OAuth username.',
    required: true,
  },
  {
    name: 'serviceAccountSecret',
    label: 'Service Account Secret (sask)',
    type: 'password',
    helpText: 'The "sask" value from your .ionapi file — used as the OAuth password.',
    required: true,
  },
]

// ── Token exchange helper ────────────────────────────────────────────────────

async function requestToken(
  tokenUrl: string,
  clientId: string,
  clientSecret: string,
  username: string,
  password: string,
): Promise<Credentials> {
  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: clientId,
    client_secret: clientSecret,
    username,
    password,
  })
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    body: body.toString(),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`infor-wms token request to ${tokenUrl} returned ${res.status}: ${text}`)
  }
  const json = (await res.json()) as Record<string, unknown>
  const accessToken = String(json['access_token'] ?? '')
  if (!accessToken) throw new Error('infor-wms: token response missing access_token')
  const expiresIn = typeof json['expires_in'] === 'number' ? json['expires_in'] : undefined
  return {
    accessToken,
    refreshToken: json['refresh_token'] ? String(json['refresh_token']) : undefined,
    expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined,
    extra: {
      tokenUrl,
      clientId,
      clientSecret,
      serviceAccountKey: username,
      serviceAccountSecret: password,
    },
  }
}

// ── Exported form ────────────────────────────────────────────────────────────

const FORM = customForm({
  fields: FIELDS,
  async exchange(input: Record<string, string>): Promise<Credentials> {
    const ionApiUrl = normaliseIonApiUrl(input['ionApiUrl'])
    const tenantId = normaliseInforTenantId(input['tenantId'])
    const tokenUrl = normaliseInforTokenUrl(input['tokenUrl'])
    const clientId = (input['clientId'] ?? '').trim()
    const clientSecret = input['clientSecret'] ?? ''
    const saak = (input['serviceAccountKey'] ?? '').trim()
    const sask = input['serviceAccountSecret'] ?? ''

    if (!clientId || !clientSecret || !saak || !sask) {
      throw new Error('Infor client ID, client secret, service account key and secret are required.')
    }

    await assertPublicHost(new URL(tokenUrl).hostname)
    await assertPublicHost(new URL(ionApiUrl).hostname)

    const creds = await requestToken(tokenUrl, clientId, clientSecret, saak, sask)
    return {
      ...creds,
      extra: {
        ...creds.extra,
        ionApiUrl,
        tenantId,
      },
    }
  },
})

export function credentialFields(): CredentialField[] {
  return FORM.credentialFields()
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  return FORM.exchangeCredentials(fields)
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const extra = credentials.extra ?? {}
  const ionApiUrl = String(extra['ionApiUrl'] ?? '')
  const tenantId = String(extra['tenantId'] ?? '')
  const storedTokenUrl = String(extra['tokenUrl'] ?? '')
  const clientId = String(extra['clientId'] ?? '')
  const clientSecret = String(extra['clientSecret'] ?? '')
  const saak = String(extra['serviceAccountKey'] ?? '')
  const sask = String(extra['serviceAccountSecret'] ?? '')

  if (!storedTokenUrl || !clientId || !clientSecret || !saak || !sask) {
    // Cannot refresh without stored credentials — return existing.
    return credentials
  }
  const tokenUrl = normaliseInforTokenUrl(storedTokenUrl)
  await assertPublicHost(new URL(tokenUrl).hostname)
  const refreshed = await requestToken(tokenUrl, clientId, clientSecret, saak, sask)
  return {
    ...refreshed,
    extra: {
      ...refreshed.extra,
      ionApiUrl,
      tenantId,
    },
  }
}

export function getAuthUrlUnsupported(): never {
  throw new Error('infor-wms uses ION API service-account credentials; use credentialFields() instead')
}

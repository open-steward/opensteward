/**
 * SAP Sales Cloud Version 2 — authentication helpers.
 *
 * V2 has no browser OAuth authorization-code endpoint. External API clients
 * authenticate as a technical (communication) user: HTTP Basic to
 * `GET {tenant}/sap/c4c/api/v1/iam-service/token` returns a bearer token valid
 * for about an hour, sent as `Authorization: Bearer` on every API call. (OAuth2
 * SAML bearer assertion also exists, for user propagation from SAP BTP; it
 * needs an identity provider this adapter does not have.)
 *
 * The tenant host is per customer (`myXXXXXX.crm.cloud.sap`) and receives the
 * technical user's password, so it is restricted to `*.crm.cloud.sap`. There is
 * no refresh token, so the technical user is kept in `credentials.extra` and a
 * new token is minted when the old one expires.
 *
 * Refs (SAP): "SAP Sales & Service Cloud v2 + ESM - Token Based Authentication"
 * and "SAP Sales & Service Cloud V2 + ESM - API Authentication Methods",
 * community.sap.com CRM and CX blog posts by SAP.
 */

import type { CredentialField, Credentials } from '@opensteward/shared'
import { SAP_SALES_CLOUD_TOKEN_PATH } from './constants'

const TENANT_SUFFIX = '.crm.cloud.sap'
const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
/** SAP documents the iam-service token as valid for one hour. */
const DEFAULT_TOKEN_TTL_SECONDS = 3600

const TENANT_REQUIRED = 'SAP Sales Cloud tenant is required (e.g. my123456.crm.cloud.sap).'
const TENANT_FOREIGN = 'SAP Sales Cloud tenant must be a *.crm.cloud.sap host.'

export const SAP_NO_AUTHORIZATION_CODE_FLOW =
  'SAP Sales Cloud Version 2 has no OAuth authorization-code endpoint; connect with a technical user instead.'

export const SAP_CREDENTIAL_FIELDS: CredentialField[] = [
  {
    name: 'tenantUrl',
    label: 'SAP Sales Cloud tenant',
    type: 'text',
    required: true,
    placeholder: 'my123456.crm.cloud.sap',
    helpText: 'Your tenant host, e.g. my123456.crm.cloud.sap.',
  },
  {
    name: 'username',
    label: 'Technical user',
    type: 'text',
    required: true,
    helpText: 'A technical (communication) user with API access to the objects you need.',
  },
  { name: 'password', label: 'Password', type: 'password', required: true },
]

/**
 * Reduce a customer-typed tenant to `https://{tenant}.crm.cloud.sap`:
 * `my123456`, `my123456.crm.cloud.sap` and a pasted `https://…/sap/c4c/api/v1/`
 * all become `https://my123456.crm.cloud.sap`. Anything outside
 * `*.crm.cloud.sap` — including `http:`, a port or embedded credentials — is
 * refused, because the password is sent to this host.
 */
export function normaliseTenantUrl(raw: string | undefined | null): string {
  const s = (raw ?? '').trim().toLowerCase()
  if (!s) throw new Error(TENANT_REQUIRED)
  if (/^[a-z][a-z0-9+.-]*:\/\//.test(s) && !s.startsWith('https://')) {
    throw new Error(TENANT_FOREIGN)
  }
  const host = s.replace(/^https:\/\//, '').replace(/[/?#].*$/, '')
  const full = host.includes('.') ? host : `${host}${TENANT_SUFFIX}`
  const prefix = full.endsWith(TENANT_SUFFIX) ? full.slice(0, -TENANT_SUFFIX.length) : ''
  if (!prefix || !prefix.split('.').every((label) => DNS_LABEL.test(label))) {
    throw new Error(TENANT_FOREIGN)
  }
  return `https://${full}`
}

type TokenPayload = { access_token?: unknown; expires_in?: unknown }

async function mintToken(
  rawTenantUrl: string | undefined,
  username: string,
  password: string,
): Promise<Credentials> {
  const tenantUrl = normaliseTenantUrl(rawTenantUrl)
  if (!username || !password) throw new Error('SAP Sales Cloud username and password are required.')

  const res = await fetch(`${tenantUrl}${SAP_SALES_CLOUD_TOKEN_PATH}`, {
    method: 'GET',
    headers: {
      'Authorization': `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
      'Accept': 'application/json',
    },
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`SAP Sales Cloud token request failed (${res.status}): ${text}`)
  }

  // The token arrives either at the top level or wrapped in `value`.
  const body = (await res.json()) as TokenPayload & { value?: TokenPayload }
  const payload: TokenPayload = typeof body.access_token === 'string' ? body : (body.value ?? {})
  if (typeof payload.access_token !== 'string' || !payload.access_token) {
    throw new Error('SAP Sales Cloud token response did not include an access_token.')
  }
  const ttl = Number(payload.expires_in) > 0 ? Number(payload.expires_in) : DEFAULT_TOKEN_TTL_SECONDS

  return {
    accessToken: payload.access_token,
    expiresAt: new Date(Date.now() + ttl * 1000),
    extra: { tenantUrl, username, password },
  }
}

/** Mint a token for the technical user submitted on the Connect page. */
export async function exchangeTechnicalUser(fields: Record<string, string>): Promise<Credentials> {
  return mintToken(fields['tenantUrl'], (fields['username'] ?? '').trim(), fields['password'] ?? '')
}

/**
 * Tokens expire after about an hour and there is no refresh token: mint a new
 * one with the technical user stored at connect time. Credentials without a
 * stored user are returned unchanged.
 */
export async function refreshTechnicalUser(credentials: Credentials): Promise<Credentials> {
  const extra = credentials.extra ?? {}
  const stored = (key: string): string | undefined =>
    typeof extra[key] === 'string' ? (extra[key] as string) : undefined
  const username = stored('username')
  const password = stored('password')
  if (!username || !password) return credentials

  const next = await mintToken(stored('tenantUrl'), username, password)
  return { ...credentials, ...next, extra: { ...extra, ...next.extra } }
}

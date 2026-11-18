/**
 * Oracle WMS Cloud — OAuth 2.0 client-credentials authentication
 *
 * lgfapi accepts BasicAuth or OAuth2. For OAuth2, WMS delegates to its IDCS
 * (OCI IAM) identity domain: a confidential application with the Client
 * Credentials grant, mapped in WMS to a `service_user`, obtains a token from
 *   https://idcs-{wms-tenant-id}.identity.oraclecloud.com/oauth2/v1/token
 * with scope `urn:resource:fusion:scm:logistics:wms:lgfapi/`, and calls
 *   https://{cluster}.wms.ocs.oraclecloud.com/{env-name}/wms/lgfapi/v10/…
 *
 * There is no browser redirect in this flow, so the Connect page collects the
 * WMS URL, token URL and client credentials via credentialFields() — which it
 * renders for `oauth2_cc`, not `oauth2`. Both customer-typed hosts receive a
 * secret or a token, so each is normalised and held to its Oracle domain
 * suffix before any request is made.
 *
 * Docs (WMS REST API Guide):
 *   "OAuth Client Credentials Grant Support"
 *   "Authenticate WMS APIs using Identity Cloud Service from a Custom Application"
 *   https://docs.oracle.com/en/cloud/saas/warehouse-management/26b/owmre/wms-rest-api-guide.pdf
 */
import type { Credentials, CredentialField } from '@opensteward/shared'
import { IDCS_HOST_SUFFIX, IDCS_TOKEN_PATH, LGFAPI_SCOPE, WMS_HOST_SUFFIX } from './constants'

const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/
const ENV_NAME = /^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/
const WMS_EXAMPLE = 'https://acme.wms.ocs.oraclecloud.com/prod'
const IDCS_EXAMPLE = 'https://idcs-1234abcd.identity.oraclecloud.com/oauth2/v1/token'

function parseHttpsUrl(raw: unknown, label: string, example: string): URL {
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (!value) throw new Error(`${label} is required (e.g. ${example}).`)
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    throw new Error(`${label} is not a valid URL.`)
  }
  if (url.protocol !== 'https:') throw new Error(`${label} must use https.`)
  if (url.username || url.password) throw new Error(`${label} must not contain credentials.`)
  return url
}

/** True when `host` is exactly one DNS label under `suffix`. */
function isLabelUnder(host: string, suffix: string): boolean {
  return host.endsWith(suffix) && DNS_LABEL.test(host.slice(0, -suffix.length))
}

/**
 * Reduce a pasted WMS link — `https://ta3.wms.ocs.oraclecloud.com/acme_prod`,
 * or any lgfapi URL beneath it — to its host and environment name.
 */
export function normaliseWmsUrl(raw: unknown): { wmsDomain: string; envName: string } {
  const url = parseHttpsUrl(raw, 'Oracle WMS URL', WMS_EXAMPLE)
  const wmsDomain = url.hostname.toLowerCase()
  if (!isLabelUnder(wmsDomain, WMS_HOST_SUFFIX)) {
    throw new Error('Oracle WMS URL must be a *.wms.ocs.oraclecloud.com host.')
  }
  const envName = url.pathname.split('/').filter(Boolean)[0] ?? ''
  if (!envName) {
    throw new Error(`Oracle WMS URL must include the environment name (e.g. ${WMS_EXAMPLE}).`)
  }
  if (!ENV_NAME.test(envName)) {
    throw new Error('Oracle WMS environment name must be a single path segment.')
  }
  return { wmsDomain, envName }
}

/** Build the vetted per-tenant base (`https://{wmsDomain}/{envName}`) from credentials.extra. */
export function wmsBaseFromExtra(extra: Record<string, unknown> | undefined): string {
  const wmsDomain = typeof extra?.['wmsDomain'] === 'string' ? extra['wmsDomain'] : ''
  const envName = typeof extra?.['envName'] === 'string' ? extra['envName'] : ''
  if (!wmsDomain || !envName) {
    throw new Error(
      `Oracle WMS URL is required (e.g. ${WMS_EXAMPLE}); wmsDomain/envName are missing from credentials.extra.`,
    )
  }
  const normalised = normaliseWmsUrl(`https://${wmsDomain}/${envName}`)
  if (normalised.envName !== envName) {
    throw new Error('Oracle WMS environment name must be a single path segment.')
  }
  return `https://${normalised.wmsDomain}/${normalised.envName}`
}

/**
 * Reduce the IDCS identity domain — bare host, token URL, or any console URL on
 * that domain — to its canonical token endpoint.
 */
export function normaliseIdcsTokenUrl(raw: unknown): string {
  const url = parseHttpsUrl(raw, 'Oracle IDCS token URL', IDCS_EXAMPLE)
  const host = url.hostname.toLowerCase()
  if (!isLabelUnder(host, IDCS_HOST_SUFFIX)) {
    throw new Error('Oracle IDCS token URL must be a *.identity.oraclecloud.com host.')
  }
  return `https://${host}${IDCS_TOKEN_PATH}`
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'wmsUrl',
      label: 'WMS URL',
      type: 'url',
      placeholder: WMS_EXAMPLE,
      helpText: 'Your WMS base URL including the environment name — everything before /wms/ in a WMS link.',
      required: true,
    },
    {
      name: 'tokenUrl',
      label: 'IDCS token URL',
      type: 'url',
      placeholder: IDCS_EXAMPLE,
      helpText: 'Token endpoint of the WMS IDCS identity domain that holds your confidential application.',
      required: true,
    },
    {
      name: 'clientId',
      label: 'Client ID',
      type: 'text',
      helpText: 'Confidential application with the Client Credentials grant, mapped to a WMS service user.',
      required: true,
    },
    {
      name: 'clientSecret',
      label: 'Client secret',
      type: 'password',
      required: true,
    },
    {
      name: 'scope',
      label: 'Scope',
      type: 'text',
      placeholder: LGFAPI_SCOPE,
      helpText: 'Leave blank for the standard lgfapi resource scope.',
      required: false,
    },
  ]
}

async function requestToken(
  tokenUrl: string,
  clientId: string,
  clientSecret: string,
  scope: string,
): Promise<Pick<Credentials, 'accessToken' | 'expiresAt'>> {
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope }).toString(),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`oracle-wms token request failed (${res.status}): ${text}`)
  }

  const json = (await res.json()) as { access_token: string; expires_in?: number }
  return {
    accessToken: json.access_token,
    expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : undefined,
  }
}

/** Client-credentials grant at the customer's WMS IDCS identity domain. */
export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const { wmsDomain, envName } = normaliseWmsUrl(fields['wmsUrl'])
  const tokenUrl = normaliseIdcsTokenUrl(fields['tokenUrl'])
  const clientId = (fields['clientId'] ?? '').trim()
  const clientSecret = fields['clientSecret'] ?? ''
  if (!clientId || !clientSecret) throw new Error('Client ID and client secret are required.')
  const scope = (fields['scope'] ?? '').trim() || LGFAPI_SCOPE

  const token = await requestToken(tokenUrl, clientId, clientSecret, scope)
  return {
    ...token,
    extra: { wmsDomain, envName, tokenUrl, clientId, clientSecret, scope },
  }
}

/** Client credentials issue no refresh token — re-run the grant with the stored values. */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const extra = credentials.extra ?? {}
  const tokenUrl = normaliseIdcsTokenUrl(extra['tokenUrl'])
  const clientId = typeof extra['clientId'] === 'string' ? extra['clientId'] : ''
  const clientSecret = typeof extra['clientSecret'] === 'string' ? extra['clientSecret'] : ''
  if (!clientId || !clientSecret) {
    throw new Error('oracle-wms: cannot refresh — clientId/clientSecret missing from credentials.extra')
  }
  const scope = typeof extra['scope'] === 'string' && extra['scope'] ? extra['scope'] : LGFAPI_SCOPE

  const token = await requestToken(tokenUrl, clientId, clientSecret, scope)
  return { ...credentials, ...token, extra: credentials.extra }
}

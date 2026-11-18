/**
 * Namirial auth helpers.
 *
 * eSignAnyWhere authenticates every call with a user API token: "The
 * apiToken has to be provided as HTTP Header. Please see the next sample
 * authorization (Bearer token): Key Value "Authorization" e.g. "Bearer
 * asdfngtm…"" (API Documentation,
 * https://namirial.atlassian.net/wiki/pages/viewpage.action?pageId=91882730).
 * No interactive OAuth flow — the adapter's `getAuthUrl()` throws and
 * credentials are collected via the Connect Link `credentialFields()` form.
 *
 * The API host differs per environment (demo, the shared SaaS environments
 * "including saas.esignanywhere.net, www.significant.com and others", and
 * on-premise installs), so it is collected with the token and stored on
 * `credentials.extra.host`. The token is sent to that host, so it must be
 * https and must resolve to a public address before any request is made.
 */
import { assertPublicHost, type Credentials, type CredentialField } from '@opensteward/shared'

const HOST_REQUIRED = 'Namirial eSignAnyWhere host is required (e.g. saas.esignanywhere.net).'
const HOST_INVALID = 'Namirial eSignAnyWhere host is not a valid https URL or host name.'
const HOST_NOT_CONFIGURED = 'Namirial eSignAnyWhere host is not configured for this connection.'

export const NAMIRIAL_CREDENTIAL_FIELDS: CredentialField[] = [
  {
    name: 'apiKey',
    label: 'API token',
    type: 'password',
    helpText:
      'Created in eSignAnyWhere under Settings → API Tokens and Apps. Treat as a long-lived secret.',
    required: true,
  },
  {
    name: 'host',
    label: 'eSignAnyWhere host',
    type: 'text',
    placeholder: 'saas.esignanywhere.net',
    helpText:
      'The eSignAnyWhere environment your account lives on, e.g. saas.esignanywhere.net or demo.esignanywhere.net.',
    required: true,
  },
]

/**
 * Reduce what a customer typed for their environment to `host[:port]`:
 * `saas.esignanywhere.net` and `https://SAAS.esignanywhere.net/Api` both
 * become `saas.esignanywhere.net`. Anything but https is refused.
 */
export function normaliseNamirialHost(raw: string | undefined | null): string {
  const s = (raw ?? '').trim()
  if (!s) throw new Error(HOST_REQUIRED)
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(s)?.[1]?.toLowerCase()
  if (scheme && scheme !== 'https') throw new Error('Namirial eSignAnyWhere host must use https.')
  let url: URL
  try {
    url = new URL(scheme ? s : `https://${s}`)
  } catch {
    throw new Error(HOST_INVALID)
  }
  if (url.username || url.password || !url.hostname) throw new Error(HOST_INVALID)
  return url.host
}

/** The host a stored connection talks to. */
export function connectionNamirialHost(credentials: Credentials): string {
  const stored = credentials.extra?.['host']
  if (typeof stored !== 'string' || !stored.trim()) throw new Error(HOST_NOT_CONFIGURED)
  return normaliseNamirialHost(stored)
}

export async function assertPublicNamirialHost(host: string): Promise<void> {
  await assertPublicHost(new URL(`https://${host}`).hostname)
}

export async function exchangeNamirialCredentials(
  fields: Record<string, string>,
): Promise<Credentials> {
  const apiKey = (fields.apiKey ?? '').trim()
  if (!apiKey) throw new Error('Namirial API token is required.')
  const host = normaliseNamirialHost(fields.host)
  await assertPublicNamirialHost(host)
  return { accessToken: apiKey, extra: { host } }
}

export async function refreshNamirialCredentials(
  credentials: Credentials,
): Promise<Credentials> {
  return credentials
}

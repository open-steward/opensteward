import { assertPublicHost, customForm, type CredentialField } from '@opensteward/shared'
import type { Credentials } from '../../adapter/interface'

export function buildAuthUrl(instanceUrl: string): string {
  return `${instanceUrl.replace(/\/$/, '')}/settings/api`
}

export async function exchangeCode(code: string): Promise<Credentials> {
  return { accessToken: code }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}

// ── Connect Link form ────────────────────────────────────────────────────────
//
// Manager.io is hosted per business — Manager Cloud or a self-hosted Manager
// Server — so the API endpoint is a per-customer value. Access tokens are
// created per business and sent as `X-API-Key` to that endpoint on every call,
// which is why the host must be https and publicly routable.

const EXAMPLE_URL = 'https://acme.manager.io/api2'

const FIELDS: CredentialField[] = [
  {
    name: 'instanceUrl',
    label: 'API endpoint',
    type: 'url',
    required: true,
    placeholder: EXAMPLE_URL,
    helpText:
      'In Manager, open the business → Settings → Access Tokens and copy the "Api Endpoint" shown there (the /api2 suffix is optional). A self-hosted Manager Server must be reachable from the internet over HTTPS.',
  },
  {
    name: 'apiKey',
    label: 'Access token',
    type: 'password',
    required: true,
    helpText:
      'Settings → Access Tokens → New Access Token in the same business; copy the token secret.',
  },
]

/**
 * Parse a customer-supplied server URL, require https, and refuse hosts that
 * resolve to private/reserved addresses (the deployment can opt out with
 * OST_ALLOW_PRIVATE_HOSTS=1).
 */
async function vetServerUrl(raw: string | undefined, label: string, example: string): Promise<URL> {
  const value = (raw ?? '').trim()
  if (!value) throw new Error(`${label} is required.`)
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${label} must be a full URL such as ${example}.`)
  }
  if (url.protocol !== 'https:') {
    throw new Error(`${label} must use https:// so credentials and data sent to it are encrypted.`)
  }
  if (url.username || url.password) {
    throw new Error(`${label} must not contain a user name or password.`)
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  try {
    await assertPublicHost(hostname)
  } catch (err) {
    if (err instanceof Error && err.name === 'SsrfBlockedError') {
      throw new Error(
        `${label} host ${hostname} resolves to a private or reserved network address, which this deployment does not allow.`,
        { cause: err },
      )
    }
    throw new Error(`${label} host ${hostname} could not be resolved; check the address.`, { cause: err })
  }
  return url
}

export const CREDENTIAL_FORM = customForm({
  fields: FIELDS,
  async exchange(input): Promise<Credentials> {
    const apiKey = (input['apiKey'] ?? '').trim()
    if (!apiKey) throw new Error('Access token is required.')
    const url = await vetServerUrl(input['instanceUrl'], 'API endpoint', EXAMPLE_URL)
    // Accept the endpoint exactly as Manager shows it; the client appends /api2/.
    const path = url.pathname.replace(/\/+$/, '').replace(/\/api2$/i, '')
    return { accessToken: apiKey, extra: { instanceUrl: `${url.origin}${path}` } }
  },
})

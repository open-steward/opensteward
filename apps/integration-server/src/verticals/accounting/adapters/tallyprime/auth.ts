import { assertPublicHost, customForm, type CredentialField } from '@opensteward/shared'
import type { Credentials } from '../../adapter/interface'

// TallyPrime exposes a local XML-based HTTP server via a TDL plugin.
// There is no OAuth flow and no credential — the address of that server (or of
// an HTTPS gateway in front of it) is the per-customer value, collected by the
// Connect Link form and stored in credentials.extra.baseUrl.

export function buildAuthUrl(_clientId: string, _redirectUri: string, _scopes: string[], state: string): string {
  return `http://localhost:9000?state=${encodeURIComponent(state)}`
}

// "code" is unused for TallyPrime — all config is in the adapter constructor
export function exchangeCode(_code: string): Credentials {
  return { accessToken: 'local' }
}

export function refreshCredentials(credentials: Credentials): Credentials {
  return credentials
}

// ── Connect Link form ────────────────────────────────────────────────────────

const EXAMPLE_URL = 'https://tally.example.com'

const FIELDS: CredentialField[] = [
  {
    name: 'gatewayUrl',
    label: 'TallyPrime gateway URL',
    type: 'url',
    required: true,
    placeholder: EXAMPLE_URL,
    helpText:
      "TallyPrime's XML server (F1 Help → Settings → Connectivity; port 9000 by default) only speaks plain HTTP on the machine running Tally. Publish it through an HTTPS reverse proxy or tunnel and enter that HTTPS address here. Private or LAN addresses are refused unless your OpenSteward operator sets OST_ALLOW_PRIVATE_HOSTS=1.",
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
    const url = await vetServerUrl(input['gatewayUrl'], 'TallyPrime gateway URL', EXAMPLE_URL)
    const path = url.pathname.replace(/\/+$/, '')
    // No credential exists; 'local' matches the legacy exchangeCode result.
    return { accessToken: 'local', extra: { baseUrl: `${url.origin}${path}` } }
  },
})

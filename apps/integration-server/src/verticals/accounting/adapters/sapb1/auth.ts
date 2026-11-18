import axios, { isAxiosError, type AxiosResponse } from 'axios'
import { assertPublicHost, customForm, type CredentialField } from '@opensteward/shared'
import { SAP_B1_SERVICE_LAYER_PATH } from './constants'
import type { Credentials } from '../../adapter/interface'

// SAP Business One Service Layer uses session-based login: POST /Login with
// CompanyDB + UserName + Password returns a B1SESSION cookie.
// The session id is stored as accessToken; the Service Layer host (host[:port])
// and the login are stored in extra so the client and refreshCredentials can
// re-use them. The Service Layer is installed on the customer's own server, so
// every one of these values is collected per customer by the Connect Link form.

export function buildAuthUrl(_clientId: string, _redirectUri: string, _scopes: string[], state: string): string {
  return `https://sap.com/businessone?state=${encodeURIComponent(state)}`
}

export interface SapB1Login {
  username: string
  password: string
  companyDb: string
}

function serviceLayerMessage(data: unknown): string {
  const message = (data as { error?: { message?: unknown } } | undefined)?.error?.message
  const text =
    typeof message === 'string' ? message : (message as { value?: unknown } | undefined)?.value
  return typeof text === 'string' && text ? `: ${text}` : '.'
}

async function login(host: string, account: SapB1Login): Promise<Credentials> {
  let res: AxiosResponse<unknown>
  try {
    res = await axios.post(
      `https://${host}${SAP_B1_SERVICE_LAYER_PATH}/Login`,
      { UserName: account.username, Password: account.password, CompanyDB: account.companyDb },
      { headers: { 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    if (isAxiosError(err) && err.response) {
      throw new Error(
        `SAP Business One login failed (HTTP ${err.response.status})${serviceLayerMessage(err.response.data)}`,
        { cause: err },
      )
    }
    throw err
  }
  const rawCookie: unknown = res.headers?.['set-cookie']
  const cookies = Array.isArray(rawCookie)
    ? rawCookie.join('; ')
    : typeof rawCookie === 'string'
      ? rawCookie
      : ''
  const bodySession = (res.data as { SessionId?: unknown } | undefined)?.SessionId
  const sessionId =
    cookies.match(/B1SESSION=([^;]+)/)?.[1] ?? (typeof bodySession === 'string' ? bodySession : '')
  if (!sessionId) {
    throw new Error(
      'SAP Business One login did not return a session; check the company database, user name and password.',
    )
  }
  return {
    accessToken: sessionId,
    extra: {
      host,
      companyDb: account.companyDb,
      username: account.username,
      password: account.password,
    },
  }
}

// Legacy: "code" = "username:password:companyDb" (the password may contain colons).
export async function exchangeCode(
  code: string,
  host: string,
): Promise<Credentials> {
  const parts = code.split(':')
  if (parts.length < 3) throw new Error('SAP B1 code must be "username:password:companyDb"')
  const username = parts[0] ?? ''
  const companyDb = parts[parts.length - 1] ?? ''
  const password = parts.slice(1, -1).join(':')
  const session = await login(host, { username, password, companyDb })
  return {
    accessToken: session.accessToken,
    refreshToken: code, // stored for re-login
    extra: { host, companyDb },
  }
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const extra = credentials.extra ?? {}
  const host = str(extra['host'])
  if (!host) throw new Error('SAP B1: host not found in credentials.extra')
  const username = str(extra['username'])
  const password = str(extra['password'])
  const companyDb = str(extra['companyDb'])
  if (username && password && companyDb) return login(host, { username, password, companyDb })
  return exchangeCode(credentials.refreshToken ?? '', host)
}

// ── Connect Link form ────────────────────────────────────────────────────────

const EXAMPLE_URL = 'https://b1.example.com:50000'

const FIELDS: CredentialField[] = [
  {
    name: 'serviceLayerUrl',
    label: 'Service Layer URL',
    type: 'url',
    required: true,
    placeholder: EXAMPLE_URL,
    helpText:
      'The HTTPS address of your SAP Business One Service Layer, including its port (50000 by default); the /b1s/v1 suffix is optional. It must be reachable from the internet: a Service Layer on a private network (LAN or VPN) is refused unless your OpenSteward operator sets OST_ALLOW_PRIVATE_HOSTS=1.',
  },
  {
    name: 'companyDb',
    label: 'Company database',
    type: 'text',
    required: true,
    placeholder: 'SBODEMOUS',
    helpText:
      'The company database name exactly as listed in the SAP Business One "Choose Company" window (case sensitive).',
  },
  {
    name: 'username',
    label: 'User name',
    type: 'text',
    required: true,
    helpText:
      'An SAP Business One user code — the same one used to log in to the B1 client. A dedicated integration user is recommended.',
  },
  {
    name: 'password',
    label: 'Password',
    type: 'password',
    required: true,
    helpText:
      "That user's SAP Business One password. It is stored encrypted and used to renew the Service Layer session.",
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
    for (const field of FIELDS) {
      if (!(input[field.name] ?? '').trim()) throw new Error(`${field.label} is required.`)
    }
    // Vet the host BEFORE the password is sent to it.
    const url = await vetServerUrl(input['serviceLayerUrl'], 'Service Layer URL', EXAMPLE_URL)
    const path = url.pathname.replace(/\/+$/, '').replace(/\/b1s\/v[12]$/i, '')
    if (path) {
      throw new Error(
        `Service Layer URL must be just the server address, such as ${EXAMPLE_URL} (the /b1s/v1 suffix is optional).`,
      )
    }
    return login(url.host, {
      username: (input['username'] ?? '').trim(),
      password: input['password'] ?? '',
      companyDb: (input['companyDb'] ?? '').trim(),
    })
  },
})

/**
 * The Connect Link form every Odoo adapter shares.
 *
 * What it collects, and why:
 *  - baseUrl  — Odoo Online is "<domain>.odoo.com"; Odoo.sh and self-hosted
 *               servers are anywhere. https only, and private hosts refused.
 *  - apiVersion — which documented API to speak. JSON-2 is "New in version 19.0";
 *               the External RPC API covers 14–18 (API keys are "New in version
 *               14.0") and is "scheduled for removal in Odoo 22 (fall 2028) and
 *               Online 21.1 (winter 2027)".
 *  - database — JSON-2: "X-Odoo-Database … Optional, the name of the database to
 *               connect to." RPC: execute_kw's first parameter is "the database
 *               to use, a string", so it is required there.
 *  - login    — RPC only: "The way to use API Keys in your scripts is to simply
 *               replace your password by the key. The login remains in-use."
 *  - apiKey   — "it is not possible to create keys that last for more than three
 *               months. This means that long lasting keys must be rotated at
 *               least once every three months."
 */
import { assertPublicHost } from '../../net/safe-fetch'
import type { Credentials } from '../../auth/store'
import type { CredentialField } from '../base'
import { customForm } from '../credential-templates'
import type { OdooApiVersion } from './client'

const EXAMPLE_URL = 'https://mycompany.odoo.com'
const DATABASE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/

export const ODOO_CREDENTIAL_FIELDS: CredentialField[] = [
  {
    name: 'baseUrl',
    label: 'Odoo URL',
    type: 'url',
    required: true,
    placeholder: EXAMPLE_URL,
    helpText:
      "The address you sign in to Odoo at: https://mycompany.odoo.com for Odoo Online, or your own server's HTTPS address. Self-hosted servers must be reachable from the internet over HTTPS; private network addresses are refused. On Odoo Online, API access needs a Custom plan.",
  },
  {
    name: 'apiVersion',
    label: 'Odoo version',
    type: 'select',
    required: true,
    options: [
      { value: 'json2', label: 'Odoo 19 or later (JSON-2 API)' },
      { value: 'rpc', label: 'Odoo 14 to 18 (External RPC API)' },
    ],
    helpText:
      'Odoo 19 and later use the JSON-2 API. Odoo 14 to 18 use the External RPC API, which also needs the database and login below.',
  },
  {
    name: 'database',
    label: 'Database name',
    type: 'text',
    required: false,
    placeholder: 'mycompany',
    helpText:
      'Required for Odoo 14 to 18: on Odoo Online it is the name of the instance (mycompany for mycompany.odoo.com). For Odoo 19 and later, only needed when your server hosts more than one database.',
  },
  {
    name: 'login',
    label: 'Login',
    type: 'text',
    required: false,
    placeholder: 'bot@mycompany.com',
    helpText: 'Odoo 14 to 18 only: the login of the user the API key belongs to.',
  },
  {
    name: 'apiKey',
    label: 'API key',
    type: 'password',
    required: true,
    helpText:
      'In Odoo: your avatar → Preferences / My Profile → Account Security → New API Key. Odoo does not allow keys that last more than three months, so this connection must be reconnected with a new key before the one you enter expires.',
  },
]

/**
 * Parse a customer-supplied server URL, require https, and refuse hosts that
 * resolve to private/reserved addresses (the deployment can opt out with
 * OST_ALLOW_PRIVATE_HOSTS=1).
 */
export async function vetOdooUrl(raw: string | undefined): Promise<string> {
  const label = 'Odoo URL'
  const value = (raw ?? '').trim()
  if (!value) throw new Error(`${label} is required.`)
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${label} must be a full URL such as ${EXAMPLE_URL}.`)
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
    throw new Error(`${label} host ${hostname} could not be resolved; check the address.`, {
      cause: err,
    })
  }
  // Drop the web-client route users copy from the browser (/odoo/… in 17+, /web#…).
  const path = url.pathname.replace(/\/+$/, '').replace(/\/(?:odoo|web)(?:\/.*)?$/i, '')
  return `${url.origin}${path}`
}

async function exchange(input: Record<string, string>): Promise<Credentials> {
  const apiKey = (input['apiKey'] ?? '').trim()
  if (!apiKey) throw new Error('API key is required.')
  const apiVersion = (input['apiVersion'] ?? '').trim()
  if (apiVersion !== 'json2' && apiVersion !== 'rpc') {
    throw new Error('Choose your Odoo version: 19 or later (JSON-2) or 14 to 18 (External RPC).')
  }
  const baseUrl = await vetOdooUrl(input['baseUrl'])
  const database = (input['database'] ?? '').trim()
  if (database && !DATABASE_PATTERN.test(database)) {
    throw new Error('Database name may only contain letters, digits, "_", "." and "-".')
  }
  const login = (input['login'] ?? '').trim()
  if (apiVersion === 'rpc') {
    if (!database) throw new Error('Database name is required for Odoo 14 to 18.')
    if (!login) throw new Error('Login is required for Odoo 14 to 18.')
  }
  const version: OdooApiVersion = apiVersion
  return {
    accessToken: apiKey,
    extra: {
      baseUrl,
      apiVersion: version,
      ...(database ? { database } : {}),
      ...(version === 'rpc' ? { login } : {}),
    },
  }
}

export const ODOO_CREDENTIAL_FORM = customForm({ fields: ODOO_CREDENTIAL_FIELDS, exchange })

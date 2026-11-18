import type { Credentials } from '../../adapter/interface'
import { assertPublicHost, customForm, SsrfBlockedError } from '@opensteward/shared'

// ── Connect Link form (OData publication URL + credentials) ────────────────
//
// 1C:Enterprise is installed per customer: each infobase publishes its standard
// OData interface at `<publication>/odata/standard.odata` on the customer's own
// web server, and the Bearer token travels there on every request. The URL must
// therefore be https and resolve only to public addresses before it is stored.

const URL_LABEL = '1C OData URL'
const ODATA_SUFFIX = '/odata/standard.odata'

function parsePublicationUrl(input: string): URL {
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `https://${input}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    throw new Error(
      `${URL_LABEL} must be a full web address, e.g. https://1c.example.com/accounting/odata/standard.odata.`,
    )
  }
  if (url.protocol !== 'https:') {
    throw new Error(`${URL_LABEL} must use https:// — the access token is sent with every request.`)
  }
  if (url.username || url.password) {
    throw new Error(`${URL_LABEL} must not include a username or password.`)
  }
  return url
}

async function assertReachable(url: URL): Promise<void> {
  const host = url.hostname.replace(/^\[(.*)\]$/, '$1')
  try {
    await assertPublicHost(host)
  } catch (err) {
    if (err instanceof SsrfBlockedError && err.address !== '(no address)') {
      throw new Error(
        `${URL_LABEL} must be publicly reachable — ${host} resolves to a private or reserved network address.`,
        { cause: err },
      )
    }
    throw new Error(`${URL_LABEL} host ${host} could not be resolved — check the address.`, { cause: err })
  }
}

/**
 * Accepts the infobase publication address (with or without the
 * `/odata/standard.odata` suffix, or a pasted entity URL under it) and returns
 * the OData service root, e.g. `https://1c.example.com/accounting/odata/standard.odata`.
 */
export async function normaliseOneCODataUrl(raw: string): Promise<string> {
  const url = parsePublicationUrl(raw.trim())
  await assertReachable(url)
  let path = url.pathname.replace(/\/+$/, '')
  const at = path.toLowerCase().indexOf(ODATA_SUFFIX)
  path = at !== -1 ? path.slice(0, at + ODATA_SUFFIX.length) : `${path}${ODATA_SUFFIX}`
  return `${url.origin}${path}`
}

export const ONECENT_CREDENTIAL_FORM = customForm({
  fields: [
    {
      name: 'odataUrl',
      label: URL_LABEL,
      type: 'url',
      required: true,
      placeholder: 'https://1c.example.com/accounting/odata/standard.odata',
      helpText:
        'The https address of your published infobase followed by /odata/standard.odata. The standard OData interface must be enabled for the infobase and published on your web server.',
    },
    {
      name: 'username',
      label: 'Infobase user',
      type: 'text',
      required: false,
      helpText:
        'The 1C infobase user the integration acts as. 1C publishes OData with web-service authentication, which is HTTP Basic — this is the usual setup. Leave blank only if the publication enables accessTokenAuthentication and you are supplying a token instead.',
    },
    {
      name: 'password',
      label: 'Infobase password',
      type: 'password',
      required: false,
      helpText: "The infobase user's password. Required when an infobase user is given.",
    },
    {
      name: 'accessToken',
      label: 'Access token',
      type: 'password',
      required: false,
      helpText:
        'Alternative to the user above: a JWT access token accepted by the accessTokenAuthentication setting of the publication (default.vrd). Sent as a Bearer token. Leave blank when using an infobase user.',
    },
  ],
  async exchange(input): Promise<Credentials> {
    const rawUrl = (input['odataUrl'] ?? '').trim()
    const username = (input['username'] ?? '').trim()
    const password = (input['password'] ?? '').trim()
    const accessToken = (input['accessToken'] ?? '').trim()
    if (!rawUrl) throw new Error(`${URL_LABEL} is required.`)
    // Exactly one transport must be fully specified. Accepting a half-filled
    // Basic pair would store a connection that cannot authenticate, and the
    // adapter has no validation call to catch it at connect time.
    if (username && !password) throw new Error('An infobase password is required when an infobase user is given.')
    if (!username && !accessToken) {
      throw new Error('Supply either an infobase user and password (HTTP Basic) or an access token.')
    }
    const baseUrl = await normaliseOneCODataUrl(rawUrl)
    return username
      ? { accessToken: '', extra: { baseUrl, username, password } }
      : { accessToken, extra: { baseUrl } }
  },
})

/**
 * Connect Link form for Aimeos.
 *
 * Aimeos has no common JSON API entry point — "this depends on the host
 * application and you have to retrieve the initial base URL from a
 * configuration setting" (aimeos.org/docs, JSON admin API). So the form
 * collects the full entry-point URL, stored as `credentials.extra.apiUrl`
 * and used verbatim by the client. The token is sent there on every request,
 * so the URL must be https and must resolve to a public address.
 */
import { assertPublicHost, customForm } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'

const API_URL_LABEL = 'Aimeos JSON API URL'
const TOKEN_LABEL = 'API token'

async function parsePublicHttpsUrl(raw: string, label: string, example: string): Promise<URL> {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error(`${label} must be a full URL, e.g. ${example}.`)
  }
  if (url.protocol !== 'https:') {
    throw new Error(
      `${label} must start with https:// — your credentials are sent to this address on every request.`,
    )
  }
  if (url.username || url.password) {
    throw new Error(`${label} must not contain a username or password.`)
  }
  if (url.search || url.hash) {
    throw new Error(`${label} must not contain a query string or fragment.`)
  }
  const host = url.hostname.replace(/^\[|\]$/g, '')
  try {
    await assertPublicHost(host)
  } catch (err) {
    if ((err as Error).name === 'SsrfBlockedError') {
      throw new Error(
        `${label} must be a publicly reachable host; ${host} resolves to a private or reserved address.`,
        { cause: err },
      )
    }
    throw new Error(
      `${label} host ${host} could not be resolved. Check the address and try again.`,
      { cause: err },
    )
  }
  return url
}

export const AIMEOS_FORM = customForm({
  fields: [
    {
      name: 'apiUrl',
      label: API_URL_LABEL,
      type: 'url',
      required: true,
      placeholder: 'https://shop.example.com/admin/default/jsonadm',
      helpText:
        'The JSON admin API entry point of your shop. Aimeos has no fixed path — it depends on your host application (the Laravel package default is /admin/{site}/jsonadm). Your developer can confirm it.',
    },
    {
      name: 'accessToken',
      label: TOKEN_LABEL,
      type: 'password',
      required: true,
      helpText:
        'A bearer token for an admin user that your Aimeos host application accepts on the JSON API route (for example a Laravel Sanctum token).',
    },
  ],
  async exchange(fields): Promise<Credentials> {
    const rawUrl = (fields['apiUrl'] ?? '').trim()
    const accessToken = (fields['accessToken'] ?? '').trim()
    if (!rawUrl) throw new Error(`${API_URL_LABEL} is required.`)
    if (!accessToken) throw new Error(`${TOKEN_LABEL} is required.`)

    const url = await parsePublicHttpsUrl(
      rawUrl,
      API_URL_LABEL,
      'https://shop.example.com/admin/default/jsonadm',
    )
    const path = url.pathname.replace(/\/+$/, '')
    return { accessToken, extra: { apiUrl: `${url.origin}${path}` } }
  },
})

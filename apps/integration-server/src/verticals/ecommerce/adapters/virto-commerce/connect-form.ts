/**
 * Virto Commerce Connect Link form.
 *
 * Virto Commerce is open-source and self-hosted: every customer runs their
 * own Platform Manager instance with its own identity server, so a
 * connection needs the instance's own URL as well as an API key. There is
 * no central OAuth app to authorize against.
 *
 * Verified against the live Swagger of the public demo instance
 * (https://virtostart-demo-admin.govirto.com/docs/index.html →
 * VirtoCommerce.Platform/swagger.json `components.securitySchemes`):
 * alongside an OAuth2 resource-owner-password / client-credentials flow at
 * `/connect/token`, the platform documents a static API key checked via
 * either a query string or (`api_key_header`) the `api_key` request header.
 * API keys are issued per-user in the admin under Security → Users → API
 * keys (`GET/POST /api/platform/security/users/{id}/apikeys`). A static
 * header key needs no refresh flow and no interactive login, so it is used
 * here instead of the password grant.
 *
 * `VirtoCommerceClient` reads `accessToken` (api key) and
 * `extra.platformUrl`. The key is sent to that URL on every request, so the
 * URL is normalised and must be https on a public address — mirroring
 * `../woocommerce/connect-form.ts`.
 */
import { assertPublicHost, customForm } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'

export const CONNECT_FORM = customForm({
  fields: [
    {
      name: 'apiKey',
      label: 'API key',
      type: 'password',
      required: true,
      helpText:
        'Generated for a user under Platform Manager → Security → Users → (select user) → API keys.',
    },
    {
      name: 'platformUrl',
      label: 'Platform URL',
      type: 'url',
      required: true,
      placeholder: 'https://my-instance.example.com',
      helpText: 'The address of your Virto Commerce Platform Manager instance. Must use https.',
    },
  ],
  async exchange(fields): Promise<Credentials> {
    const apiKey = (fields['apiKey'] ?? '').trim()
    if (!apiKey) throw new Error('API key is required.')
    const platformUrl = await normalisePlatformUrl(fields['platformUrl'], 'Platform URL')
    return {
      accessToken: apiKey,
      extra: { apiKey, platformUrl },
    }
  },
})

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i

/**
 * Normalise a customer-typed platform URL and refuse anything that must not
 * receive the API key: a non-https scheme, embedded userinfo, or a host
 * that resolves to a private / loopback / link-local address. A bare host
 * is read as https. Query string, fragment and any path are dropped — the
 * Platform Manager REST API is always rooted at the instance's origin.
 */
export async function normalisePlatformUrl(raw: string | undefined, label: string): Promise<string> {
  const input = (raw ?? '').trim()
  if (!input) throw new Error(`${label} is required.`)
  let url: URL
  try {
    url = new URL(HAS_SCHEME.test(input) ? input : `https://${input}`)
  } catch {
    throw new Error(`${label} is not a valid URL — enter it like https://my-instance.example.com.`)
  }
  if (url.protocol !== 'https:') {
    throw new Error(`${label} must use https:// — your API key is sent to it on every request.`)
  }
  if (url.username || url.password) {
    throw new Error(`${label} must not contain a username or password.`)
  }
  const host = url.hostname.replace(/^\[|\]$/g, '')
  try {
    await assertPublicHost(host)
  } catch (err) {
    const blocked = err instanceof Error && err.name === 'SsrfBlockedError'
    const unresolved = (err as { address?: string }).address === '(no address)'
    if (blocked && !unresolved) {
      throw new Error(
        `${label} must be a public address — ${host} resolves to a private or reserved network address.`,
        { cause: err },
      )
    }
    throw new Error(`${label} could not be resolved — check that ${host} is spelled correctly.`, {
      cause: err,
    })
  }
  return `${url.protocol}//${url.host}`
}

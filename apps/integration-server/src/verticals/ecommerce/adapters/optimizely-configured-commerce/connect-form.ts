/**
 * Optimizely Configured Commerce Connect Link form.
 *
 * Every instance is a dedicated deployment on its own domain (e.g.
 * `https://{project}.insitesandbox.com` or the customer's own domain), so
 * the form collects that instance URL plus the customer's own API user
 * username/password (the resource-owner password grant credentials — see
 * `./auth.ts`). The instance URL receives the password on every token
 * refresh, so it is normalised to https and confined to a public address the
 * same way `woocommerce`/`vtex` confine their customer-supplied hosts.
 *
 * Docs: https://docs.developers.optimizely.com/configured-commerce/reference/getting-started-with-the-b2b-commerce-rest-apis
 */
import { assertPublicHost, customForm } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { fetchToken } from './auth'

export const CONNECT_FORM = customForm({
  fields: [
    {
      name: 'instance',
      label: 'Instance URL',
      type: 'url',
      required: true,
      placeholder: 'https://mystore.insitesandbox.com',
      helpText: 'The address of your Configured Commerce instance. Must use https.',
    },
    {
      name: 'username',
      label: 'API user username',
      type: 'text',
      required: true,
      helpText: 'An Configured Commerce account (Admin Console → Accounts) used to authenticate this integration.',
    },
    {
      name: 'password',
      label: 'API user password',
      type: 'password',
      required: true,
      helpText: "That account's password. There is no refresh token — it is retained to mint a new access token when the current one expires.",
    },
  ],
  async exchange(fields): Promise<Credentials> {
    const username = (fields['username'] ?? '').trim()
    const password = (fields['password'] ?? '').trim()
    if (!(fields['instance'] ?? '').trim()) throw new Error('Instance URL is required.')
    if (!username) throw new Error('API user username is required.')
    if (!password) throw new Error('API user password is required.')

    const instance = await normaliseInstanceUrl(fields['instance'])
    const { accessToken, expiresAt } = await fetchToken(instance, username, password)

    return {
      accessToken,
      expiresAt,
      extra: { instance, username, password },
    }
  },
})

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i

/**
 * Normalise a customer-typed instance URL and refuse anything that must not
 * receive the API user's password: a non-https scheme, embedded userinfo, or
 * a host that resolves to a private / loopback / link-local address. A bare
 * host is read as https. Query string, fragment, and path are dropped — the
 * instance is always the origin.
 */
export async function normaliseInstanceUrl(raw: string | undefined): Promise<string> {
  const input = (raw ?? '').trim()
  if (!input) throw new Error('Instance URL is required.')
  let url: URL
  try {
    url = new URL(HAS_SCHEME.test(input) ? input : `https://${input}`)
  } catch {
    throw new Error('Instance URL is not a valid URL — enter it like https://mystore.insitesandbox.com.')
  }
  if (url.protocol !== 'https:') {
    throw new Error('Instance URL must use https:// — your credentials are sent to it on every request.')
  }
  if (url.username || url.password) {
    throw new Error('Instance URL must not contain a username or password.')
  }
  const host = url.hostname.replace(/^\[|\]$/g, '')
  try {
    await assertPublicHost(host)
  } catch (err) {
    const blocked = err instanceof Error && err.name === 'SsrfBlockedError'
    const unresolved = (err as { address?: string }).address === '(no address)'
    if (blocked && !unresolved) {
      throw new Error(
        `Instance URL must be a public address — ${host} resolves to a private or reserved network address.`,
        { cause: err },
      )
    }
    throw new Error(`Instance URL could not be resolved — check that ${host} is spelled correctly.`, {
      cause: err,
    })
  }
  return `${url.protocol}//${url.host}`
}

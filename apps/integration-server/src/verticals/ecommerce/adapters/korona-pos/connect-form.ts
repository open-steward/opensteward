/**
 * KORONA POS Connect Link form.
 *
 * KORONA is a multi-tenant cloud API reachable through one of several
 * cluster nodes (`https://{node}.koronacloud.com/web/api/v3/...` — the
 * `servers` block on https://128.koronacloud.com/web/api/v3/openapi.json
 * uses `128` as its own example node), so a connection needs the node
 * host, the account id, and Basic-auth credentials. Every request sends
 * the username/password to that host, so — like VTEX's account-name
 * confinement — the host is reduced to a bare `*.koronacloud.com` label
 * and anything else (including a look-alike such as
 * `128.koronacloud.com.evil.example`) is refused.
 */
import { customForm } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { CLOUD_HOST_SUFFIX } from './constants'

export const CONNECT_FORM = customForm({
  fields: [
    {
      name: 'host',
      label: 'KORONA cloud host',
      type: 'text',
      required: true,
      placeholder: '128.koronacloud.com',
      helpText:
        'Your KORONA cloud cluster node — shown in Settings → Data Exchange → API next to your API credentials.',
    },
    {
      name: 'koronaAccountId',
      label: 'KORONA account ID',
      type: 'text',
      required: true,
      helpText: 'Your KORONA Studio account id, shown on the same API settings page.',
    },
    {
      name: 'username',
      label: 'API username',
      type: 'text',
      required: true,
      helpText: 'Created in Settings → Data Exchange → API.',
    },
    {
      name: 'password',
      label: 'API password',
      type: 'password',
      required: true,
      helpText: 'Shown once when the API credential is created.',
    },
  ],
  async exchange(fields): Promise<Credentials> {
    const koronaAccountId = (fields['koronaAccountId'] ?? '').trim()
    const username = (fields['username'] ?? '').trim()
    const password = (fields['password'] ?? '').trim()
    if (!koronaAccountId) throw new Error('KORONA account ID is required.')
    if (!username) throw new Error('API username is required.')
    if (!password) throw new Error('API password is required.')
    const host = parseKoronaHost(fields['host'])
    return {
      accessToken: username,
      extra: { host, koronaAccountId, username, password },
    }
  },
})

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i
/** A bare `{label}` + `CLOUD_HOST_SUFFIX` host — anchored at both ends. */
const KORONA_HOST = new RegExp(
  `^[a-z0-9-]+${CLOUD_HOST_SUFFIX.replace(/\./g, '\\.')}$`,
)

/** Reduce a customer-typed host or pasted KORONA URL to `{node}.koronacloud.com`. */
export function parseKoronaHost(raw: string | undefined): string {
  const input = (raw ?? '').trim().toLowerCase()
  if (!input) throw new Error('KORONA cloud host is required.')
  const notKorona = () =>
    new Error(
      `"${raw?.trim()}" is not a KORONA cloud host — enter it like "128.koronacloud.com".`,
    )

  let candidate = input
  if (HAS_SCHEME.test(input) || input.includes('/')) {
    let url: URL
    try {
      url = new URL(HAS_SCHEME.test(input) ? input : `https://${input}`)
    } catch {
      throw notKorona()
    }
    if (url.username || url.password || url.port) throw notKorona()
    candidate = url.hostname
  }

  if (!KORONA_HOST.test(candidate)) throw notKorona()
  return candidate
}

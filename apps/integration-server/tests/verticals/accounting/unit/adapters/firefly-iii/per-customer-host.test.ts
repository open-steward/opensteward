/**
 * Firefly III is self-hosted. Its OAuth clients are created inside each
 * installation (Profile → OAuth), so a deployment-wide client id only ever
 * works against one server, and the adapter read that server only from
 * deployment config — which the admin UI cannot set — falling back to the
 * public demo host. A Connect Link customer's bearer token would have been
 * sent to demo.firefly-iii.org.
 *
 * Customers now connect with their own server URL and a Personal Access
 * Token through `credentialFields` / `exchangeCredentials`. The URL is
 * normalised and SSRF-checked before the token is sent anywhere, the token
 * is validated against `/api/v1/about/user`, and the client builds its base
 * URL from `credentials.extra.instanceUrl` — never from a demo fallback.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import { setDnsResolver, SsrfBlockedError } from '@opensteward/shared'
import { FireflyIiiAdapter } from '../../../../../../src/verticals/accounting/adapters/firefly-iii/index'
import { normaliseInstanceUrl } from '../../../../../../src/verticals/accounting/adapters/firefly-iii/auth'

const CFG = {
  clientId: '',
  clientSecret: '',
  redirectUri: 'http://localhost:3010/auth/accounting/firefly-iii/callback',
}

beforeEach(() => {
  vi.stubEnv('OST_ALLOW_PRIVATE_HOSTS', '')
  setDnsResolver(async () => [{ address: '93.184.216.34' }])
})

afterEach(() => {
  setDnsResolver(undefined)
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('normaliseInstanceUrl', () => {
  it.each([
    ['https://firefly.example.com', 'https://firefly.example.com'],
    ['https://firefly.example.com/', 'https://firefly.example.com'],
    ['  https://Example.COM/firefly/?x=1#y ', 'https://example.com/firefly'],
    ['firefly.example.com', 'https://firefly.example.com'],
  ])('%s → %s', (input, want) => {
    expect(normaliseInstanceUrl(input)).toBe(want)
  })

  it('rejects blanks, http, embedded credentials and unparseable input', () => {
    for (const blank of ['', '  ', undefined]) {
      expect(() => normaliseInstanceUrl(blank)).toThrow('Firefly III URL is required')
    }
    expect(() => normaliseInstanceUrl('http://firefly.example.com')).toThrow(
      'Firefly III URL must use https',
    )
    expect(() => normaliseInstanceUrl('https://u:p@firefly.example.com')).toThrow(
      'Firefly III URL must not contain a username or password',
    )
    expect(() => normaliseInstanceUrl('https://fire fly.example.com')).toThrow(
      'Firefly III URL is not a valid URL',
    )
  })
})

describe('FireflyIiiAdapter connecting a customer’s own server', () => {
  const adapter = new FireflyIiiAdapter(CFG)

  it('declares the server URL and a personal access token as credential fields', () => {
    expect(adapter.credentialFields()).toEqual([
      expect.objectContaining({ name: 'instanceUrl', type: 'url', required: true }),
      expect.objectContaining({ name: 'personalAccessToken', type: 'password', required: true }),
    ])
  })

  it('validates the token on the customer’s server and stores the normalised URL', async () => {
    const get = vi.spyOn(axios, 'get').mockResolvedValue({ data: { data: { id: '1' } } })
    const creds = await adapter.exchangeCredentials({
      instanceUrl: ' https://Firefly.Example.com/ ',
      personalAccessToken: ' pat-123 ',
    })
    expect(get).toHaveBeenCalledTimes(1)
    expect(get.mock.calls[0][0]).toBe('https://firefly.example.com/api/v1/about/user')
    expect(get.mock.calls[0][1]).toMatchObject({ headers: { Authorization: 'Bearer pat-123' } })
    expect(creds).toEqual({
      accessToken: 'pat-123',
      tenantId: 'https://firefly.example.com',
      extra: { instanceUrl: 'https://firefly.example.com' },
    })
  })

  it('refuses to send the token to a server that resolves to a private address', async () => {
    setDnsResolver(async () => [{ address: '127.0.0.1' }])
    const get = vi.spyOn(axios, 'get')
    await expect(
      adapter.exchangeCredentials({ instanceUrl: 'https://firefly.lan.example', personalAccessToken: 'pat' }),
    ).rejects.toBeInstanceOf(SsrfBlockedError)
    expect(get).not.toHaveBeenCalled()
  })

  it('rejects a blank URL, an http URL or a blank token before any request', async () => {
    const get = vi.spyOn(axios, 'get')
    await expect(
      adapter.exchangeCredentials({ instanceUrl: '', personalAccessToken: 'pat' }),
    ).rejects.toThrow('Firefly III URL is required')
    await expect(
      adapter.exchangeCredentials({ instanceUrl: 'http://firefly.example.com', personalAccessToken: 'pat' }),
    ).rejects.toThrow('Firefly III URL must use https')
    await expect(
      adapter.exchangeCredentials({ instanceUrl: 'https://firefly.example.com', personalAccessToken: '  ' }),
    ).rejects.toThrow('Firefly III personal access token is required')
    expect(get).not.toHaveBeenCalled()
  })

  it('never builds an OAuth URL on the demo host when no server is configured', () => {
    expect(() => adapter.getAuthUrl('st')).toThrow('Firefly III URL is required')
  })

  it('calls the API on the server stored with the credentials', async () => {
    const create = vi.spyOn(axios, 'create')
    await adapter
      .listAccounts({ accessToken: 'pat', extra: { instanceUrl: 'https://firefly.example.com' } }, {})
      .catch(() => undefined) // the request itself is not under test
    const baseURL = (create.mock.calls.at(-1)?.[0] as { baseURL?: string } | undefined)?.baseURL
    expect(baseURL).toBe('https://firefly.example.com/api/v1/')
  })

  it('still reads the server from tenantId for connections made before extra was recorded', async () => {
    const create = vi.spyOn(axios, 'create')
    await adapter
      .listAccounts({ accessToken: 'pat', tenantId: 'https://old.example.com' }, {})
      .catch(() => undefined)
    const baseURL = (create.mock.calls.at(-1)?.[0] as { baseURL?: string } | undefined)?.baseURL
    expect(baseURL).toBe('https://old.example.com/api/v1/')
  })

  it('refuses to call the API — rather than the demo host — when no server is stored', async () => {
    const create = vi.spyOn(axios, 'create')
    await expect(adapter.listAccounts({ accessToken: 'pat' }, {})).rejects.toThrow(
      'Firefly III URL is missing from the connection',
    )
    expect(create).not.toHaveBeenCalled()
  })
})

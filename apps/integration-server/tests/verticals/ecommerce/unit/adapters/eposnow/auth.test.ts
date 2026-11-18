/**
 * Epos Now OAuth client credentials.
 *
 * They are adapter config (`clientId`, `clientSecret`, `redirectUri`), set in
 * the admin UI or on /admin/platforms/ecommerce/eposnow/{enable,config} — the
 * same as every other OAuth adapter. `EPOSNOW_CLIENT_ID` / `_CLIENT_SECRET` /
 * `_REDIRECT_URI` are a deprecated fallback for deployments that configured
 * the adapter before it read its config, and apply only per key the config
 * leaves unset. A blank or non-string value counts as unset: the admin
 * credentials form saves a blank field as '', which must not hide an env
 * value, and the admin API stores whatever JSON it is sent. Taking a value
 * from the env raises a DeprecationWarning naming the variable.
 *
 * Refresh is deliberately NOT config-driven: a refresh token is bound to the
 * client that minted it, so it uses the pair the exchange stored in
 * `credentials.extra`, and it must hand back everything else the connection
 * stored — refreshWithRotationGuard persists the returned blob wholesale.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import {
  EposNowAdapter,
  type EposNowAdapterConfig,
} from '../../../../../../src/verticals/ecommerce/adapters/eposnow/index'
import {
  AUTH_URL,
  TOKEN_URL,
} from '../../../../../../src/verticals/ecommerce/adapters/eposnow/constants'
import { ADAPTER_FACTORIES } from '../../../../../../src/verticals/ecommerce/adapter/factories'

const CONFIG_REDIRECT = 'https://config.example/auth/ecommerce/eposnow/callback'
const ENV_REDIRECT = 'https://env.example/auth/ecommerce/eposnow/callback'
const ROUTER_REDIRECT = 'https://router.example/auth/ecommerce/eposnow/callback'

const ENV_NAMES = ['EPOSNOW_CLIENT_ID', 'EPOSNOW_CLIENT_SECRET', 'EPOSNOW_REDIRECT_URI'] as const

function mockTokenEndpoint(
  data: Record<string, unknown> = {
    access_token: 'at-new',
    refresh_token: 'rt-new',
    expires_in: 3600,
  },
) {
  return vi.spyOn(axios, 'post').mockResolvedValue({ data })
}

function authParams(adapter: EposNowAdapter, state = 'state-1'): URLSearchParams {
  const url = new URL(adapter.getAuthUrl(state))
  expect(`${url.origin}${url.pathname}`).toBe(AUTH_URL)
  return url.searchParams
}

function stubEnvPair() {
  vi.stubEnv('EPOSNOW_CLIENT_ID', 'env-id')
  vi.stubEnv('EPOSNOW_CLIENT_SECRET', 'env-secret')
}

let warn: ReturnType<typeof vi.fn>

/** The env variables each DeprecationWarning named, in order. */
function warnedNames(): string[] {
  return warn.mock.calls.map(([message, options]) => {
    expect(options).toMatchObject({ type: 'DeprecationWarning' })
    return (
      ENV_NAMES.find((name) => String(message).startsWith(`${name} `)) ??
      `unexpected: ${String(message)}`
    )
  })
}

beforeEach(() => {
  // A developer's shell must not leak into these tests.
  for (const name of ENV_NAMES) vi.stubEnv(name, '')
  warn = vi.fn()
  vi.spyOn(process, 'emitWarning').mockImplementation(warn as unknown as typeof process.emitWarning)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('EposNowAdapter.getAuthUrl', () => {
  it('builds the authorize URL from the adapter config', () => {
    const adapter = new EposNowAdapter({
      clientId: 'cfg-id',
      clientSecret: 'cfg-secret',
      redirectUri: CONFIG_REDIRECT,
    })
    const params = authParams(adapter, 'state-42')
    expect(params.get('client_id')).toBe('cfg-id')
    expect(params.get('redirect_uri')).toBe(CONFIG_REDIRECT)
    expect(params.get('response_type')).toBe('code')
    expect(params.get('state')).toBe('state-42')
  })

  it('prefers the config over the deprecated env values', () => {
    stubEnvPair()
    vi.stubEnv('EPOSNOW_REDIRECT_URI', ENV_REDIRECT)
    const params = authParams(
      new EposNowAdapter({
        clientId: 'cfg-id',
        clientSecret: 'cfg-secret',
        redirectUri: CONFIG_REDIRECT,
      }),
    )
    expect(params.get('client_id')).toBe('cfg-id')
    expect(params.get('redirect_uri')).toBe(CONFIG_REDIRECT)
  })

  it('falls back to the deprecated env values when the config has none', () => {
    stubEnvPair()
    vi.stubEnv('EPOSNOW_REDIRECT_URI', ENV_REDIRECT)
    const params = authParams(new EposNowAdapter())
    expect(params.get('client_id')).toBe('env-id')
    expect(params.get('redirect_uri')).toBe(ENV_REDIRECT)
  })

  it('treats an empty-string config value as unset, so the env value still applies', () => {
    vi.stubEnv('EPOSNOW_REDIRECT_URI', ENV_REDIRECT)
    const params = authParams(
      new EposNowAdapter({ clientId: 'cfg-id', clientSecret: 'cfg-secret', redirectUri: '' }),
    )
    expect(params.get('client_id')).toBe('cfg-id')
    expect(params.get('redirect_uri')).toBe(ENV_REDIRECT)
  })

  it('falls back to the env client id when the admin form saved a blank one', () => {
    // buildPlatformConfig trims and saves the Client ID field whenever it is
    // posted, so an operator who relies on the env and saves the page for any
    // other reason stores clientId ''.
    stubEnvPair()
    const params = authParams(
      new EposNowAdapter({
        clientId: '',
        clientSecret: 'cfg-secret',
        redirectUri: CONFIG_REDIRECT,
      }),
    )
    expect(params.get('client_id')).toBe('env-id')
  })

  it('throws when no client id is set in the config or the env', () => {
    const adapter = new EposNowAdapter({
      clientId: '',
      clientSecret: 'cfg-secret',
      redirectUri: CONFIG_REDIRECT,
    })
    expect(() => adapter.getAuthUrl('state-1')).toThrow(
      /requires clientId in the eposnow adapter config/,
    )
  })

  it('throws when no client secret is set, before the user is sent through consent', () => {
    const adapter = new EposNowAdapter({ clientId: 'cfg-id', redirectUri: CONFIG_REDIRECT })
    expect(() => adapter.getAuthUrl('state-1')).toThrow(
      /requires clientSecret in the eposnow adapter config/,
    )
  })

  it('encodes client_id and state, so a configured value cannot add query parameters', () => {
    const clientId = 'abc&redirect_uri=https://evil.example/cb#frag'
    const adapter = new EposNowAdapter({
      clientId,
      clientSecret: 'cfg-secret',
      redirectUri: CONFIG_REDIRECT,
    })
    const url = new URL(adapter.getAuthUrl('st&x=1'))
    expect(url.hash).toBe('')
    expect(url.searchParams.get('client_id')).toBe(clientId)
    expect(url.searchParams.getAll('redirect_uri')).toEqual([CONFIG_REDIRECT])
    expect(url.searchParams.get('state')).toBe('st&x=1')
    expect(url.searchParams.has('x')).toBe(false)
  })
})

describe('EposNowAdapter.exchangeCode', () => {
  it('posts the config client pair with the redirect URI the router passes, and stores the pair in extra', async () => {
    const post = mockTokenEndpoint()
    const adapter = new EposNowAdapter({
      clientId: 'cfg-id',
      clientSecret: 'cfg-secret',
      redirectUri: CONFIG_REDIRECT,
    })

    const creds = await adapter.exchangeCode('code-1', ROUTER_REDIRECT)

    expect(post).toHaveBeenCalledTimes(1)
    expect(post).toHaveBeenCalledWith(TOKEN_URL, {
      grant_type: 'authorization_code',
      code: 'code-1',
      redirect_uri: ROUTER_REDIRECT,
      client_id: 'cfg-id',
      client_secret: 'cfg-secret',
    })
    expect(creds.accessToken).toBe('at-new')
    expect(creds.refreshToken).toBe('rt-new')
    expect(creds.extra).toEqual({ clientId: 'cfg-id', clientSecret: 'cfg-secret' })
  })

  it('prefers the config secret over the env secret', async () => {
    stubEnvPair()
    const post = mockTokenEndpoint()

    const creds = await new EposNowAdapter({
      clientId: 'cfg-id',
      clientSecret: 'cfg-secret',
    }).exchangeCode('code-1', ROUTER_REDIRECT)

    expect(post.mock.calls[0]![1]).toMatchObject({
      client_id: 'cfg-id',
      client_secret: 'cfg-secret',
    })
    expect(creds.extra).toEqual({ clientId: 'cfg-id', clientSecret: 'cfg-secret' })
  })

  it('falls back to the deprecated env pair when the config has none', async () => {
    stubEnvPair()
    const post = mockTokenEndpoint()

    const creds = await new EposNowAdapter({}).exchangeCode('code-1', ROUTER_REDIRECT)

    expect(post.mock.calls[0]![1]).toMatchObject({
      client_id: 'env-id',
      client_secret: 'env-secret',
      redirect_uri: ROUTER_REDIRECT,
    })
    expect(creds.extra).toEqual({ clientId: 'env-id', clientSecret: 'env-secret' })
  })

  it('treats empty-string config values as unset, so the env pair still applies', async () => {
    stubEnvPair()
    const post = mockTokenEndpoint()

    const creds = await new EposNowAdapter({ clientId: '', clientSecret: '' }).exchangeCode(
      'code-1',
      ROUTER_REDIRECT,
    )

    expect(post.mock.calls[0]![1]).toMatchObject({
      client_id: 'env-id',
      client_secret: 'env-secret',
    })
    expect(creds.extra).toEqual({ clientId: 'env-id', clientSecret: 'env-secret' })
  })

  it('treats non-string config values as unset, and never posts them', async () => {
    // The admin API stores any JSON: { clientId: 123, clientSecret: true } is accepted.
    stubEnvPair()
    const post = mockTokenEndpoint()
    const config = { clientId: 123, clientSecret: true } as unknown as EposNowAdapterConfig

    const creds = await new EposNowAdapter(config).exchangeCode('code-1', ROUTER_REDIRECT)

    expect(post.mock.calls[0]![1]).toMatchObject({
      client_id: 'env-id',
      client_secret: 'env-secret',
    })
    expect(creds.extra).toEqual({ clientId: 'env-id', clientSecret: 'env-secret' })
  })

  it('treats a whitespace-only secret as unset', async () => {
    const post = mockTokenEndpoint()
    const adapter = new EposNowAdapter({ clientId: 'cfg-id', clientSecret: '   ' })

    await expect(adapter.exchangeCode('code-1', ROUTER_REDIRECT)).rejects.toThrow(
      /requires clientSecret in the eposnow adapter config/,
    )
    expect(post).not.toHaveBeenCalled()
  })

  it('throws without calling the token endpoint when no client secret is set', async () => {
    const post = mockTokenEndpoint()
    const adapter = new EposNowAdapter({ clientId: 'cfg-id', redirectUri: CONFIG_REDIRECT })

    await expect(adapter.exchangeCode('code-1', ROUTER_REDIRECT)).rejects.toThrow(
      /requires clientSecret in the eposnow adapter config/,
    )
    expect(post).not.toHaveBeenCalled()
  })

  it('throws without calling the token endpoint when no client id is set', async () => {
    const post = mockTokenEndpoint()
    const adapter = new EposNowAdapter({ clientSecret: 'cfg-secret', redirectUri: CONFIG_REDIRECT })

    await expect(adapter.exchangeCode('code-1', ROUTER_REDIRECT)).rejects.toThrow(
      /requires clientId in the eposnow adapter config/,
    )
    expect(post).not.toHaveBeenCalled()
  })
})

describe('EposNowAdapter with the env variables absent altogether (the Compose state)', () => {
  it('refuses to authorize or exchange, and posts nothing', async () => {
    for (const name of ENV_NAMES) vi.stubEnv(name, undefined)
    expect(process.env['EPOSNOW_CLIENT_ID']).toBeUndefined()
    const post = mockTokenEndpoint()
    const adapter = new EposNowAdapter()

    expect(() => adapter.getAuthUrl('state-1')).toThrow(
      /requires clientId and clientSecret in the eposnow adapter config/,
    )
    await expect(adapter.exchangeCode('code-1', ROUTER_REDIRECT)).rejects.toThrow(
      /requires clientId and clientSecret in the eposnow adapter config/,
    )
    expect(post).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })
})

describe('EposNowAdapter deprecated env fallback warning', () => {
  it('raises a DeprecationWarning naming each variable it falls back to, once per adapter', async () => {
    stubEnvPair()
    vi.stubEnv('EPOSNOW_REDIRECT_URI', ENV_REDIRECT)
    mockTokenEndpoint()
    const adapter = new EposNowAdapter()

    adapter.getAuthUrl('state-1')
    adapter.getAuthUrl('state-2')
    await adapter.exchangeCode('code-1', ROUTER_REDIRECT)

    expect(warnedNames().sort()).toEqual([...ENV_NAMES].sort())
  })

  it('warns only for the keys the config leaves unset', () => {
    stubEnvPair()
    vi.stubEnv('EPOSNOW_REDIRECT_URI', ENV_REDIRECT)

    new EposNowAdapter({
      clientId: 'cfg-id',
      clientSecret: 'cfg-secret',
      redirectUri: CONFIG_REDIRECT,
    }).getAuthUrl('s')
    expect(warn).not.toHaveBeenCalled()

    new EposNowAdapter({ clientId: 'cfg-id', redirectUri: CONFIG_REDIRECT }).getAuthUrl('s')
    expect(warnedNames()).toEqual(['EPOSNOW_CLIENT_SECRET'])
  })
})

describe('EposNowAdapter.refreshCredentials', () => {
  const stored = (): Credentials => ({
    accessToken: 'at-old',
    refreshToken: 'rt-old',
    expiresAt: new Date(Date.now() - 1_000),
    extra: { clientId: 'stored-id', clientSecret: 'stored-secret' },
  })

  it('refreshes with the client pair stored at exchange, not the current config or env', async () => {
    stubEnvPair()
    const post = mockTokenEndpoint()
    const adapter = new EposNowAdapter({ clientId: 'cfg-id', clientSecret: 'cfg-secret' })

    await adapter.refreshCredentials(stored())

    expect(post).toHaveBeenCalledWith(TOKEN_URL, {
      grant_type: 'refresh_token',
      refresh_token: 'rt-old',
      client_id: 'stored-id',
      client_secret: 'stored-secret',
    })
  })

  it('refuses to refresh without a stored client pair rather than borrow the config or env one', async () => {
    stubEnvPair()
    const post = mockTokenEndpoint()
    const adapter = new EposNowAdapter({ clientId: 'cfg-id', clientSecret: 'cfg-secret' })

    await expect(adapter.refreshCredentials({ ...stored(), extra: {} })).rejects.toThrow(
      /credentials\.extra/,
    )
    expect(post).not.toHaveBeenCalled()
  })

  it('keeps webhookSecret, tenantId, scope and extra, which the refresh does not own', async () => {
    mockTokenEndpoint()
    const before: Credentials = {
      ...stored(),
      webhookSecret: 'whsec-conn-1',
      tenantId: 'tenant-1',
      scope: 'read write',
      extra: { clientId: 'stored-id', clientSecret: 'stored-secret', locationId: 7 },
    }

    const after = await new EposNowAdapter().refreshCredentials(before)

    expect(after.accessToken).toBe('at-new')
    expect(after.refreshToken).toBe('rt-new')
    expect(after.expiresAt!.getTime()).toBeGreaterThan(Date.now())
    expect(after.webhookSecret).toBe('whsec-conn-1')
    expect(after.tenantId).toBe('tenant-1')
    expect(after.scope).toBe('read write')
    expect(after.extra).toEqual({
      clientId: 'stored-id',
      clientSecret: 'stored-secret',
      locationId: 7,
    })
  })

  it('keeps the stored refresh token when the response carries none', async () => {
    mockTokenEndpoint({ access_token: 'at-new', expires_in: 3600 })

    const after = await new EposNowAdapter().refreshCredentials(stored())

    expect(after.accessToken).toBe('at-new')
    expect(after.refreshToken).toBe('rt-old')
  })

  it('treats a response without expires_in as a non-expiring token, as the exchange does', async () => {
    // Keeping the stored expiresAt instead would leave a time already in the
    // past, and token-refresher would refresh on every request.
    mockTokenEndpoint({ access_token: 'at-new', refresh_token: 'rt-new' })

    const after = await new EposNowAdapter().refreshCredentials(stored())

    expect(after.expiresAt).toBeUndefined()
  })
})

describe('eposnow factory', () => {
  it('hands the stored adapter config to the adapter', () => {
    const factory = ADAPTER_FACTORIES['eposnow']!
    const adapter = factory({
      clientId: 'stored-cfg-id',
      clientSecret: 'stored-cfg-secret',
      redirectUri: CONFIG_REDIRECT,
    }) as EposNowAdapter
    const params = authParams(adapter)
    expect(params.get('client_id')).toBe('stored-cfg-id')
    expect(params.get('redirect_uri')).toBe(CONFIG_REDIRECT)
  })
})

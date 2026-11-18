/**
 * Fluent Commerce is account-scoped: the token endpoint and the GraphQL API
 * live on `{ACCOUNT}.api.fluentretail.com` (production) or
 * `{ACCOUNT}.sandbox.api.fluentretail.com` (sandbox), authenticated with a
 * resource-owner password grant. The adapter used to build
 * `{account}.production.api.fluentretail.com`, a host Fluent does not serve.
 *
 * Account and environment are collected by `credentialFields()`, which the
 * Connect page renders once the platform is relabelled from `oauth2` to
 * `basic` (password grant, no redirect). The host receives the user's password
 * and the bearer token, so anything outside api.fluentretail.com is refused.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { FluentCommerceAdapter } from '../../../../../../src/verticals/inventory/adapters/fluent-commerce/index'
import {
  fluentApiHost,
  normaliseFluentAccount,
} from '../../../../../../src/verticals/inventory/adapters/fluent-commerce/constants'

function tokenResponse(): Response {
  return new Response(JSON.stringify({ access_token: 'tok', refresh_token: 'rt', expires_in: 1800 }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function fakeHttp() {
  return { post: vi.fn().mockResolvedValue({ data: { data: {} } }) }
}

const FIELDS = {
  accountId: ' ACME ',
  env: '',
  username: 'integration@acme.com',
  password: 'pw',
  clientSecret: 'sec',
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('normaliseFluentAccount / fluentApiHost', () => {
  it.each([
    ['ACME', '', { accountId: 'ACME', env: 'production' }],
    ['acme', 'sandbox', { accountId: 'acme', env: 'sandbox' }],
    ['https://ACME.sandbox.api.fluentretail.com/graphql', '', { accountId: 'ACME', env: 'sandbox' }],
    ['acme.api.fluentretail.com', 'production', { accountId: 'acme', env: 'production' }],
  ])('(%s, %s) → %o', (account, env, want) => {
    expect(normaliseFluentAccount(account, env)).toEqual(want)
  })

  it('builds the documented production and sandbox hosts', () => {
    expect(fluentApiHost({ accountId: 'ACME', env: 'production' })).toBe('acme.api.fluentretail.com')
    expect(fluentApiHost({ accountId: 'ACME', env: 'sandbox' })).toBe('acme.sandbox.api.fluentretail.com')
  })

  it('rejects blanks with a message naming the field', () => {
    for (const v of ['', '   ', undefined]) {
      expect(() => normaliseFluentAccount(v, '')).toThrow(/Fluent account ID is required/)
    }
  })

  it.each(['evil.example.com', 'acme.api.fluentretail.com.evil.example', 'a.b.api.fluentretail.com', 'ac me'])(
    'rejects %s — the password must not leave api.fluentretail.com',
    (input) => {
      expect(() => normaliseFluentAccount(input, '')).toThrow(
        /Fluent account must be an account ID or a \*\.api\.fluentretail\.com host/,
      )
    },
  )

  it('rejects unknown environments and a host that contradicts the chosen one', () => {
    expect(() => normaliseFluentAccount('ACME', 'staging')).toThrow(/Fluent environment must be production or sandbox/)
    expect(() => normaliseFluentAccount('acme.sandbox.api.fluentretail.com', 'production')).toThrow(
      /Fluent environment does not match the account host/,
    )
  })
})

describe('FluentCommerceAdapter with a per-customer account', () => {
  const adapter = new FluentCommerceAdapter()

  it('declares account and environment on the credential form (renders once relabelled basic)', () => {
    expect(adapter.credentialFields()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'accountId', required: true }),
        expect.objectContaining({ name: 'env', type: 'select' }),
        expect.objectContaining({ name: 'password', required: true, type: 'password' }),
      ]),
    )
  })

  it('requests the token from the production account host and stores the normalised account', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => tokenResponse())
    const creds = await adapter.exchangeCredentials(FIELDS)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0]!
    expect(String(url)).toBe('https://acme.api.fluentretail.com/oauth/token')
    expect((init?.headers as Record<string, string>)['fluent.account']).toBe('ACME')
    expect(new URLSearchParams(String(init?.body)).get('grant_type')).toBe('password')
    expect(creds.accessToken).toBe('tok')
    expect(creds.extra).toEqual({ accountId: 'ACME', env: 'production', clientSecret: 'sec' })
  })

  it('uses the sandbox host when sandbox is chosen', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => tokenResponse())
    await adapter.exchangeCredentials({ ...FIELDS, env: 'sandbox' })
    expect(String(fetchSpy.mock.calls[0]![0])).toBe('https://acme.sandbox.api.fluentretail.com/oauth/token')
  })

  it.each([
    [{ ...FIELDS, accountId: '' }, /Fluent account ID is required/],
    [{ ...FIELDS, accountId: 'acme.api.fluentretail.com.evil.example' }, /Fluent account must be an account ID or a \*\.api\.fluentretail\.com host/],
    [{ ...FIELDS, env: 'staging' }, /Fluent environment must be production or sandbox/],
    [{ ...FIELDS, password: '' }, /Integration user email, password and client secret are required/],
  ])('rejects %o before any request', async (fields, message) => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => tokenResponse())
    await expect(adapter.exchangeCredentials(fields)).rejects.toThrow(message)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('refuses to refresh for a stored account outside api.fluentretail.com', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => tokenResponse())
    await expect(
      adapter.refreshCredentials({
        accessToken: 'old',
        refreshToken: 'rt',
        extra: { accountId: 'evil.example.com', env: 'production', clientSecret: 'sec' },
      }),
    ).rejects.toThrow(/Fluent account must be an account ID or a \*\.api\.fluentretail\.com host/)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('calls GraphQL on the account host stored with the credentials', async () => {
    const http = fakeHttp()
    const create = vi
      .spyOn(axios, 'create')
      .mockReturnValue(http as unknown as ReturnType<typeof axios.create>)
    await adapter
      .listLocations({ accessToken: 'tok', extra: { accountId: 'ACME', env: 'production' } }, {})
      .catch(() => undefined) // response mapping is not under test
    const cfg = create.mock.calls[0]![0] as { baseURL?: string; headers?: Record<string, string> }
    expect(cfg.baseURL).toBe('https://acme.api.fluentretail.com/graphql')
    expect(cfg.headers?.['fluent.account']).toBe('ACME')
    expect(http.post).toHaveBeenCalledTimes(1)
  })

  it('sends no API request for a stored account outside api.fluentretail.com', async () => {
    const http = fakeHttp()
    const create = vi
      .spyOn(axios, 'create')
      .mockReturnValue(http as unknown as ReturnType<typeof axios.create>)
    await expect(
      adapter.listLocations({ accessToken: 'tok', extra: { accountId: 'evil.example.com', env: 'production' } }, {}),
    ).rejects.toThrow(/Fluent account must be an account ID or a \*\.api\.fluentretail\.com host/)
    expect(create).not.toHaveBeenCalled()
    expect(http.post).not.toHaveBeenCalled()
  })
})

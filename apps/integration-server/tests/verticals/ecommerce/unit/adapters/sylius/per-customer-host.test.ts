/**
 * Sylius is self-hosted: the admin API lives on the store's own host. Its
 * API-Platform admin API authenticates an administrator by email + password
 * (`POST /api/v2/admin/administrators/token`, or `/authentication-token`
 * before 1.13) and returns a JWT. There is no OAuth authorization-code flow
 * in core Sylius.
 *
 * The adapter read the store URL from deployment config — which the admin UI
 * cannot set — and built an authorize URL on the placeholder
 * `https://your-sylius-store.example` for an `/oauth/authorize` endpoint that
 * does not exist. The store URL and administrator login now come from the
 * credential form; the URL receives the password, so it must be https and
 * must not resolve to a private address.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import { setDnsResolver, SsrfBlockedError } from '@opensteward/shared'
import { SyliusAdapter } from '../../../../../../src/verticals/ecommerce/adapters/sylius/index'

const LOGIN = { email: 'api@example.com', password: 'pw' }

function httpError(status: number) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status },
  })
}

beforeEach(() => {
  setDnsResolver(async () => [{ address: '93.184.216.34' }])
})

afterEach(() => {
  vi.restoreAllMocks()
  setDnsResolver(undefined)
})

describe('SyliusAdapter per-customer store', () => {
  const adapter = new SyliusAdapter()

  it('collects store URL, administrator email and password on the credential form', () => {
    expect(adapter.credentialFields().map((f) => [f.name, f.required])).toEqual([
      ['baseUrl', true],
      ['email', true],
      ['password', true],
    ])
  })

  it('does not build an OAuth authorize URL on a placeholder host', () => {
    expect(() => adapter.getAuthUrl('st')).toThrow(
      'Sylius authenticates with an administrator email and password: use the credential form, not a browser redirect.',
    )
  })

  it('logs in on the customer store and stores the normalised origin', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: { token: 'jwt' } })
    const creds = await adapter.exchangeCredentials({
      ...LOGIN,
      baseUrl: ' https://Shop.Example.com/admin/ ',
    })
    expect(post).toHaveBeenCalledTimes(1)
    expect(post.mock.calls[0]![0]).toBe('https://shop.example.com/api/v2/admin/administrators/token')
    expect(post.mock.calls[0]![1]).toEqual({ email: 'api@example.com', password: 'pw' })
    expect(creds.accessToken).toBe('jwt')
    expect(creds.expiresAt).toBeInstanceOf(Date)
    expect(creds.extra).toEqual({
      baseUrl: 'https://shop.example.com',
      email: 'api@example.com',
      password: 'pw',
    })
  })

  it('falls back to the pre-1.13 token path when the current one is not found', async () => {
    const post = vi
      .spyOn(axios, 'post')
      .mockRejectedValueOnce(httpError(404))
      .mockResolvedValueOnce({ data: { token: 'jwt-old' } })
    const creds = await adapter.exchangeCredentials({ ...LOGIN, baseUrl: 'https://shop.example.com' })
    expect(post.mock.calls.map((c) => c[0])).toEqual([
      'https://shop.example.com/api/v2/admin/administrators/token',
      'https://shop.example.com/api/v2/admin/authentication-token',
    ])
    expect(creds.accessToken).toBe('jwt-old')
  })

  it('rejects blank, invalid and non-https URLs, and a missing login, before any request', async () => {
    const post = vi.spyOn(axios, 'post')
    await expect(adapter.exchangeCredentials({ ...LOGIN, baseUrl: '' })).rejects.toThrow(
      'Sylius store URL is required (e.g. https://shop.example.com).',
    )
    await expect(adapter.exchangeCredentials({ ...LOGIN, baseUrl: 'https://' })).rejects.toThrow(
      'Sylius store URL is not a valid URL.',
    )
    await expect(
      adapter.exchangeCredentials({ ...LOGIN, baseUrl: 'http://shop.example.com' }),
    ).rejects.toThrow('Sylius store URL must use https://.')
    await expect(
      adapter.exchangeCredentials({ baseUrl: 'https://shop.example.com', email: 'a@b.c', password: '' }),
    ).rejects.toThrow('Sylius administrator email and password are required.')
    expect(post).not.toHaveBeenCalled()
  })

  it('refuses a store that resolves to a private address, on login and on refresh', async () => {
    setDnsResolver(async () => [{ address: '10.1.2.3' }])
    const post = vi.spyOn(axios, 'post')
    await expect(
      adapter.exchangeCredentials({ ...LOGIN, baseUrl: 'https://sylius.internal.example' }),
    ).rejects.toBeInstanceOf(SsrfBlockedError)
    await expect(
      adapter.refreshCredentials({
        accessToken: 'old',
        extra: { baseUrl: 'https://sylius.internal.example', ...LOGIN },
      }),
    ).rejects.toBeInstanceOf(SsrfBlockedError)
    expect(post).not.toHaveBeenCalled()
  })

  it('refreshes by logging in again on the stored store', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: { token: 'jwt2' } })
    const creds = await adapter.refreshCredentials({
      accessToken: 'old',
      extra: { baseUrl: 'https://shop.example.com', ...LOGIN },
    })
    expect(post.mock.calls[0]![0]).toBe('https://shop.example.com/api/v2/admin/administrators/token')
    expect(creds.accessToken).toBe('jwt2')
  })

  it('calls the admin API on the store stored with the credentials', async () => {
    const fail = () => Promise.reject(new Error('offline'))
    const create = vi
      .spyOn(axios, 'create')
      .mockReturnValue({ get: fail, post: fail, patch: fail, delete: fail } as never)
    await adapter
      .listProducts({ accessToken: 'jwt', extra: { baseUrl: 'https://shop.example.com' } }, {})
      .catch(() => undefined)
    expect((create.mock.calls[0]![0] as { baseURL?: string }).baseURL).toBe(
      'https://shop.example.com/api/v2/admin',
    )
  })
})

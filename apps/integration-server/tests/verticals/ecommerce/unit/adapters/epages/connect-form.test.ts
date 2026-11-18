/**
 * ePages Beyond Connect Link form — every shop is served at
 * `https://{shop}.beyondshop.cloud`, so the shop field is confined to that
 * suffix BEFORE the client secret is ever sent anywhere (mirrors
 * ../vtex/per-customer-host.test.ts).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { EpagesAdapter } from '../../../../../../src/verticals/ecommerce/adapters/epages/index'
import { parseEpagesShop } from '../../../../../../src/verticals/ecommerce/adapters/epages/connect-form'

const VALID = { shop: 'myshop', clientId: 'client-1', clientSecret: 'secret-1' }

afterEach(() => vi.restoreAllMocks())

describe('parseEpagesShop', () => {
  it.each([
    ['myshop', 'myshop'],
    ['MyShop', 'myshop'],
    ['myshop.beyondshop.cloud', 'myshop'],
    ['https://myshop.beyondshop.cloud/', 'myshop'],
    ['https://myshop.beyondshop.cloud/cockpit', 'myshop'],
  ])('normalises %s to %s', (input, expected) => {
    expect(parseEpagesShop(input)).toBe(expected)
  })

  it.each([
    'myshop.beyondshop.cloud.evil.example',
    'https://evil.example/myshop.beyondshop.cloud',
    'myshop.evil.example',
    'https://myshop.beyondshop.cloud@evil.example',
    'my shop',
    'myshop/../x',
    'ftp://myshop.beyondshop.cloud',
  ])('rejects a host outside beyondshop.cloud: %s', (input) => {
    expect(() => parseEpagesShop(input)).toThrow(/not an ePages Beyond shop address/)
  })
})

describe('EpagesAdapter Connect Link form', () => {
  const adapter = new EpagesAdapter()

  it('declares shop, clientId, clientSecret with the secret masked', () => {
    const fields = adapter.credentialFields()
    const byName = Object.fromEntries(fields.map((f) => [f.name, f]))
    expect(Object.keys(byName).sort()).toEqual(['clientId', 'clientSecret', 'shop'])
    expect(byName['clientSecret']!.type).toBe('password')
    for (const f of fields) expect(f.required).toBe(true)
  })

  it('rejects a look-alike host BEFORE any network call is made', async () => {
    const post = vi.spyOn(axios, 'post')
    await expect(
      adapter.exchangeCredentials({ ...VALID, shop: 'myshop.beyondshop.cloud.evil.example' }),
    ).rejects.toThrow(/not an ePages Beyond shop address/)
    expect(post).not.toHaveBeenCalled()
  })

  it('exchanges valid credentials via HTTP Basic auth against the shop-specific token endpoint', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({
      data: { access_token: 'jwt-token', token_type: 'bearer', expires_in: 299 },
    })
    const creds = await adapter.exchangeCredentials(VALID)
    expect(post).toHaveBeenCalledWith(
      'https://myshop.beyondshop.cloud/api/oauth/token',
      expect.any(String),
      expect.objectContaining({
        auth: { username: 'client-1', password: 'secret-1' },
      }),
    )
    expect(creds.accessToken).toBe('jwt-token')
    expect(creds.extra).toEqual({ shop: 'myshop', clientId: 'client-1', clientSecret: 'secret-1' })
  })
})

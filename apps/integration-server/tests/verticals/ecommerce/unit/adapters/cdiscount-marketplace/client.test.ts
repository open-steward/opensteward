/**
 * Doc: https://developer.octopia-io.net/api-reference/ — every call needs
 * `Authorization: Bearer` + `SellerId`; list responses are a verified
 * `{ items, itemsPerPage }` envelope with the next cursor in a `Link:
 * rel="next"` header (see client.ts header comment for the verbatim
 * examples this is built from).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import axios from 'axios'
import {
  OctopiaClient,
  parseNextCursor,
  hasNextLink,
} from '../../../../../../src/verticals/ecommerce/adapters/cdiscount-marketplace/client'
import { API_BASE_URL } from '../../../../../../src/verticals/ecommerce/adapters/cdiscount-marketplace/constants'

vi.mock('axios')

describe('parseNextCursor / hasNextLink', () => {
  it('extracts the cursor query param from a rel="next" Link header', () => {
    const link = '<https://api.octopia-io.net/seller/v2/products?cursor=abc123&limit=50>; rel="next"'
    expect(parseNextCursor(link)).toBe('abc123')
    expect(hasNextLink(link)).toBe(true)
  })

  it('returns undefined/false with no Link header or no rel="next"', () => {
    expect(parseNextCursor(undefined)).toBeUndefined()
    expect(hasNextLink(undefined)).toBe(false)
    const onlyPrev = '<https://api.octopia-io.net/products?cursor=x>; rel="prev"'
    expect(parseNextCursor(onlyPrev)).toBeUndefined()
    expect(hasNextLink(onlyPrev)).toBe(false)
  })
})

describe('OctopiaClient', () => {
  let getSpy: ReturnType<typeof vi.fn>
  let postSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    getSpy = vi.fn()
    postSpy = vi.fn()
    vi.mocked(axios.create).mockReturnValue({
      get: getSpy,
      post: postSpy,
      patch: vi.fn(),
      delete: vi.fn(),
    } as unknown as ReturnType<typeof axios.create>)
  })

  function makeClient(): OctopiaClient {
    return new OctopiaClient({ accessToken: 'tok_abc', extra: { sellerId: 'seller-9' } })
  }

  it('requires accessToken and sellerId', () => {
    expect(() => new OctopiaClient({ accessToken: '', extra: { sellerId: 'seller-9' } })).toThrow(/accessToken/)
    expect(() => new OctopiaClient({ accessToken: 'tok_abc', extra: {} })).toThrow(/sellerId/)
  })

  it('sends Authorization: Bearer and SellerId on every request', () => {
    makeClient()
    const config = vi.mocked(axios.create).mock.calls[0]![0]!
    expect(config.baseURL).toBe(API_BASE_URL)
    expect(config.headers).toMatchObject({
      Authorization: 'Bearer tok_abc',
      SellerId: 'seller-9',
    })
  })

  it('listWithCursor unwraps the confirmed { items, itemsPerPage } envelope and reads the Link header', async () => {
    getSpy.mockResolvedValue({
      data: { items: [{ reference: 'A1' }], itemsPerPage: 50 },
      headers: { link: '<https://x/products?cursor=next1&limit=50>; rel="next"' },
    })
    const client = makeClient()
    const res = await client.listWithCursor('products', { limit: 50 })
    expect(res.items).toEqual([{ reference: 'A1' }])
    expect(res.nextCursor).toBe('next1')
    const [path, options] = getSpy.mock.calls[0]!
    expect(path).toBe('products')
    expect((options as { params: Record<string, unknown> }).params['limit']).toBe(50)
  })

  it('listWithCursor clamps limit to the supplied maxLimit', async () => {
    getSpy.mockResolvedValue({ data: { items: [] }, headers: {} })
    const client = makeClient()
    await client.listWithCursor('seller/v2/offers', { limit: 5000 }, 1000)
    const [, options] = getSpy.mock.calls[0]!
    expect((options as { params: Record<string, unknown> }).params['limit']).toBe(1000)
  })

  it('getPage reports hasMore from the Link header without needing a cursor value', async () => {
    getSpy.mockResolvedValue({
      data: { items: [{ orderId: 'o1' }], itemsPerPage: 50 },
      headers: { link: '<https://x/orders?pageIndex=2>; rel="next"' },
    })
    const client = makeClient()
    const res = await client.getPage('orders', { pageIndex: 1, pageSize: 50 })
    expect(res.items).toEqual([{ orderId: 'o1' }])
    expect(res.hasMore).toBe(true)
  })

  it('getPage reports hasMore: false on the last page', async () => {
    getSpy.mockResolvedValue({ data: { items: [] }, headers: {} })
    const client = makeClient()
    const res = await client.getPage('orders', { pageIndex: 3, pageSize: 50 })
    expect(res.hasMore).toBe(false)
  })
})

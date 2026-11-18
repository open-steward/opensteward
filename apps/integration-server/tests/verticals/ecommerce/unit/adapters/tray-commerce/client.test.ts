/**
 * Docs: https://developers.tray.com.br/ `#api-de-produtos` — "All API
 * requests require `?access_token={token}`"; the legacy `paging` envelope
 * (`total, page, offset, limit, maxLimit`); the bracket-path
 * `application/x-www-form-urlencoded` write convention (confirmed for
 * products/variants/categories/customers/orders); and `#api-de-multicd`'s
 * distinct `{number, size, total, from, to, links}` pagination and plain
 * JSON write body. See `client.ts` header for the full evidence trail.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  TrayCommerceClient,
  pagingHasMore,
  multiCdPagingHasMore,
  flattenToBracketForm,
} from '../../../../../../src/verticals/ecommerce/adapters/tray-commerce/client'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('pagingHasMore (legacy CakePHP paging)', () => {
  it('is true when the current page has not reached the total', () => {
    expect(pagingHasMore({ total: 120, page: 1, limit: 50 })).toBe(true)
  })

  it('is false on the last page', () => {
    expect(pagingHasMore({ total: 120, page: 3, limit: 50 })).toBe(false)
  })

  it('is undefined when the platform reported no usable paging block', () => {
    expect(pagingHasMore(undefined)).toBeUndefined()
    expect(pagingHasMore({})).toBeUndefined()
  })
})

describe('multiCdPagingHasMore (Multi-CD paging)', () => {
  it('is true when number*size has not reached total', () => {
    expect(multiCdPagingHasMore({ number: 1, size: 10, total: 15 })).toBe(true)
  })

  it('is false on the last page', () => {
    expect(multiCdPagingHasMore({ number: 2, size: 10, total: 15 })).toBe(false)
  })

  it('is undefined when the platform reported no usable paging block', () => {
    expect(multiCdPagingHasMore(undefined)).toBeUndefined()
    expect(multiCdPagingHasMore({})).toBeUndefined()
  })
})

describe('flattenToBracketForm', () => {
  it('produces the literal bracket-path key for a flat field', () => {
    expect(flattenToBracketForm({ name: 'X' }, '["Product"]')).toEqual([['["Product"]["name"]', 'X']])
  })

  it('nests through an array of objects, matching the documented Sku[] example', () => {
    const result = flattenToBracketForm(
      { Sku: [{ type: 'Cor', value: 'Azul' }, { type: 'Tamanho', value: '38' }] },
      '["Variant"]',
    )
    expect(result).toEqual([
      ['["Variant"]["Sku"][0]["type"]', 'Cor'],
      ['["Variant"]["Sku"][0]["value"]', 'Azul'],
      ['["Variant"]["Sku"][1]["type"]', 'Tamanho'],
      ['["Variant"]["Sku"][1]["value"]', '38'],
    ])
  })

  it('drops undefined and null fields rather than sending them', () => {
    expect(flattenToBracketForm({ name: 'X', description: undefined, price: null }, '["Product"]')).toEqual([
      ['["Product"]["name"]', 'X'],
    ])
  })
})

describe('TrayCommerceClient', () => {
  it('throws when the connection has no validated api_host', () => {
    expect(() => new TrayCommerceClient({ accessToken: 'tok', extra: {} })).toThrow(
      'missing its validated api_host',
    )
  })

  it('builds the axios instance on the stored api_host', () => {
    const create = vi.spyOn(axios, 'create')
    new TrayCommerceClient({
      accessToken: 'tok',
      extra: { apiHost: 'https://minhaloja.commercesuite.com.br/web_api' },
    })
    expect((create.mock.calls[0]![0] as { baseURL?: string }).baseURL).toBe(
      'https://minhaloja.commercesuite.com.br/web_api',
    )
  })

  it('sends `access_token` as a query PARAM on GET, never concatenated into the path', async () => {
    const get = vi.fn().mockResolvedValue({ data: { ok: true } })
    vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn(), put: vi.fn(), delete: vi.fn() } as never)
    const client = new TrayCommerceClient({
      accessToken: 'super-secret-token',
      extra: { apiHost: 'https://minhaloja.commercesuite.com.br/web_api' },
    })
    await client.get('products', { page: 1, limit: 50 })
    expect(get).toHaveBeenCalledWith('products', {
      params: { access_token: 'super-secret-token', page: 1, limit: 50 },
    })
  })

  it('postForm sends bracket-path x-www-form-urlencoded, wrapped under the given key', async () => {
    const post = vi.fn().mockResolvedValue({ data: { id: '1', code: 201 } })
    vi.spyOn(axios, 'create').mockReturnValue({ get: vi.fn(), post, put: vi.fn(), delete: vi.fn() } as never)
    const client = new TrayCommerceClient({
      accessToken: 'tok',
      extra: { apiHost: 'https://minhaloja.commercesuite.com.br/web_api' },
    })
    await client.postForm('products', 'Product', { name: 'X', ean: '123' })
    expect(post).toHaveBeenCalledTimes(1)
    const [path, body, config] = post.mock.calls[0]!
    expect(path).toBe('products')
    expect(String(body)).toContain('%5B%22Product%22%5D%5B%22name%22%5D=X')
    expect((config as { headers?: Record<string, string> }).headers?.['Content-Type']).toBe(
      'application/x-www-form-urlencoded',
    )
    expect((config as { params?: Record<string, string> }).params).toEqual({ access_token: 'tok' })
  })

  it('putForm sends the same bracket-path encoding on PUT', async () => {
    const put = vi.fn().mockResolvedValue({ data: { message: 'Saved' } })
    vi.spyOn(axios, 'create').mockReturnValue({ get: vi.fn(), post: vi.fn(), put, delete: vi.fn() } as never)
    const client = new TrayCommerceClient({
      accessToken: 'tok',
      extra: { apiHost: 'https://minhaloja.commercesuite.com.br/web_api' },
    })
    await client.putForm('products/1', 'Product', { name: 'X' })
    expect(put).toHaveBeenCalledTimes(1)
    expect(String(put.mock.calls[0]![1])).toContain('%5B%22Product%22%5D%5B%22name%22%5D=X')
  })

  it('postJson/putJson send a plain JSON body (the Multi-CD convention)', async () => {
    const put = vi.fn().mockResolvedValue({ data: { message: 'success', data: [] } })
    vi.spyOn(axios, 'create').mockReturnValue({ get: vi.fn(), post: vi.fn(), put, delete: vi.fn() } as never)
    const client = new TrayCommerceClient({
      accessToken: 'tok',
      extra: { apiHost: 'https://minhaloja.commercesuite.com.br/web_api' },
    })
    await client.putJson('multicd/distribution-centers/1/stock', { product_id: 10, stock: 2 })
    expect(put).toHaveBeenCalledWith(
      'multicd/distribution-centers/1/stock',
      { product_id: 10, stock: 2 },
      { params: { access_token: 'tok' } },
    )
  })

  it('carries access_token on delete too', async () => {
    const del = vi.fn().mockResolvedValue({ data: {} })
    vi.spyOn(axios, 'create').mockReturnValue({ get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: del } as never)
    const client = new TrayCommerceClient({
      accessToken: 'tok',
      extra: { apiHost: 'https://minhaloja.commercesuite.com.br/web_api' },
    })
    await client.delete('products/1')
    expect(del).toHaveBeenCalledWith('products/1', { params: { access_token: 'tok' } })
  })

  it('retries a 429 and eventually succeeds (withRetry)', async () => {
    const err = Object.assign(new Error('rate limited'), { response: { status: 429 } })
    const get = vi.fn().mockRejectedValueOnce(err).mockResolvedValueOnce({ data: { ok: true } })
    vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn(), put: vi.fn(), delete: vi.fn() } as never)
    const client = new TrayCommerceClient({
      accessToken: 'tok',
      extra: { apiHost: 'https://minhaloja.commercesuite.com.br/web_api' },
    })
    const result = await client.get('products')
    expect(result).toEqual({ ok: true })
    expect(get).toHaveBeenCalledTimes(2)
  }, 10_000)
})

/**
 * Gumroad listProducts paging contract.
 *
 * `GET /v2/products` documents no request parameters and no page size. Its
 * response carries `next_page_key`, "Opaque cursor to pass as page_key to
 * fetch the next page", "present when more results follow"
 * (https://gumroad.com/api#get-/products). Gumroad's own controller
 * (antiwork/gumroad app/controllers/api/v2/links_controller.rb) serves a fixed
 * `RESULTS_PER_PAGE = 10` per page, keyset-paged by `page_key`.
 *
 * One upstream page is therefore not one caller page, so the adapter must cut
 * the caller's rows out of the stream (pageByRows). The fake upstream below
 * honours only `page_key`; anything else is ignored, as the real server would.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  withPageSink,
  readUpstreamPage,
  parseListQuery,
  listPage,
  _resetRowPager,
} from '@opensteward/shared'
import type { QueryParams } from '@opensteward/shared'
import { GumroadAdapter } from '../../../../../../src/verticals/ecommerce/adapters/gumroad/index'

const CREDS = { accessToken: 'gum-token' }
const RESULTS_PER_PAGE = 10

interface Call {
  path: string
  params: Record<string, unknown> | undefined
}

function makeServer(rows: number, prefix = 'prod') {
  const ids = Array.from({ length: rows }, (_, i) => `${prefix}-${String(i + 1).padStart(4, '0')}`)
  const calls: Call[] = []
  const keyFor = (offset: number): string => Buffer.from(`${prefix}:${offset}`).toString('base64')
  const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
    const params = config?.params
    calls.push({ path, params })
    if (path !== '/products') throw new Error(`unexpected path in test: ${path}`)
    let start = 0
    const pageKey = params?.['page_key']
    if (pageKey !== undefined && pageKey !== null) {
      const m = /^([^:]+):(\d+)$/.exec(Buffer.from(String(pageKey), 'base64').toString())
      if (!m || m[1] !== prefix || Number(m[2]) >= rows)
        throw Object.assign(new Error('400 Invalid page_key.'), { response: { status: 400 } })
      start = Number(m[2])
    }
    const slice = ids.slice(start, start + RESULTS_PER_PAGE)
    const more = start + RESULTS_PER_PAGE < rows
    const data: Record<string, unknown> = {
      success: true,
      products: slice.map((id) => ({ id, name: id, price: 100, published: true })),
    }
    if (more) {
      const next = keyFor(start + RESULTS_PER_PAGE)
      data['next_page_key'] = next
      data['next_page_url'] = `/v2/products?page_key=${next}`
    }
    return { data }
  })
  return { get, calls, ids, keyFor }
}

function fakeGumroad(rows: number, prefix?: string) {
  const server = makeServer(rows, prefix)
  vi.spyOn(axios, 'create').mockReturnValue({ get: server.get, defaults: {} } as never)
  return server
}

afterEach(() => {
  vi.restoreAllMocks()
  _resetRowPager()
})

describe('Gumroad listProducts paging', () => {
  it('serves 2L+1 products once each, in order, across pages 1..3 with exact hasMore', async () => {
    for (const L of [3, 10, 17]) {
      _resetRowPager()
      const { ids } = fakeGumroad(2 * L + 1)
      const adapter = new GumroadAdapter()
      const seen: string[] = []
      const hasMore: (boolean | undefined)[] = []
      for (const page of [1, 2, 3]) {
        const params = withPageSink({ page, limit: L } as QueryParams)
        const rows = await adapter.listProducts(CREDS, params)
        seen.push(...rows.map((r) => r.id))
        hasMore.push(readUpstreamPage(params)?.hasMore)
        expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
      }
      expect(seen).toEqual(ids)
      expect(hasMore).toEqual([true, true, false])
      vi.restoreAllMocks()
    }
  })

  it('page 2 carries the documented page_key', async () => {
    const L = 12
    const { calls, keyFor, ids } = fakeGumroad(2 * L + 1)
    const adapter = new GumroadAdapter()
    const params = withPageSink({ page: 2, limit: L } as QueryParams)
    const rows = await adapter.listProducts(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(ids.slice(L, 2 * L))
    expect(calls[0]!.params?.['page_key']).toBeUndefined()
    expect(calls.some((c) => c.params?.['page_key'] === keyFor(RESULTS_PER_PAGE))).toBe(true)
    for (const c of calls) {
      expect(Object.keys(c.params ?? {}).filter((k) => k !== 'page_key')).toEqual([])
    }
  })

  it('clamps a limit above the router maximum and still serves every row', async () => {
    const first = parseListQuery({ limit: '5000', page: '1' })
    const MAX = first.limit!
    expect(MAX).toBeLessThan(5000)
    const { ids } = fakeGumroad(2 * MAX + 1)
    const adapter = new GumroadAdapter()
    const seen: string[] = []
    for (let page = 1; ; page++) {
      expect(page).toBeLessThan(10)
      const params = withPageSink(parseListQuery({ limit: '5000', page: String(page) }))
      const rows = await adapter.listProducts(CREDS, params)
      expect(rows.length).toBeLessThanOrEqual(MAX)
      seen.push(...rows.map((r) => r.id))
      if (!readUpstreamPage(params)?.hasMore) break
    }
    expect(seen).toEqual(ids)
  })

  it('API path: parseListQuery then listPage gives the right meta.hasMore', async () => {
    const { ids } = fakeGumroad(25)
    const adapter = new GumroadAdapter()

    const p1 = parseListQuery({ limit: '10', page: '1' })
    const r1 = listPage(await adapter.listProducts(CREDS, p1), p1, 'gumroad')
    expect(r1.data.map((d) => d.id)).toEqual(ids.slice(0, 10))
    expect(r1.meta.hasMore).toBe(true)

    const p3 = parseListQuery({ limit: '10', page: '3' })
    const r3 = listPage(await adapter.listProducts(CREDS, p3), p3, 'gumroad')
    expect(r3.data.map((d) => d.id)).toEqual(ids.slice(20))
    expect(r3.meta.hasMore).toBe(false)
  })

  it('an empty next_page_key ends the walk instead of sending page_key=""', async () => {
    const server = makeServer(15)
    const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
      const res = await server.get(path, config)
      if (!('next_page_key' in res.data)) res.data['next_page_key'] = ''
      return res
    })
    vi.spyOn(axios, 'create').mockReturnValue({ get, defaults: {} } as never)
    const adapter = new GumroadAdapter()
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (const page of [1, 2]) {
      const params = withPageSink({ page, limit: 10 } as QueryParams)
      seen.push(...(await adapter.listProducts(CREDS, params)).map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(server.ids)
    expect(hasMore).toEqual([true, false])
    expect(server.calls.some((c) => c.params?.['page_key'] === '')).toBe(false)
  })

  it('two connections never share a walk', async () => {
    const a = makeServer(15, 'aaa')
    const b = makeServer(15, 'bbb')
    vi.spyOn(axios, 'create').mockImplementation(((config?: {
      headers?: Record<string, string>
    }) => {
      const auth = config?.headers?.['Authorization'] ?? ''
      const server = { 'Bearer token-a': a, 'Bearer token-b': b }[auth]
      if (!server) throw new Error(`no fake seller for ${auth}`)
      return { get: server.get, defaults: {} }
    }) as never)
    const adapter = new GumroadAdapter()
    const ra = await adapter.listProducts(
      { accessToken: 'token-a' },
      withPageSink({ page: 1, limit: 5 } as QueryParams),
    )
    expect(ra.map((r) => r.id)).toEqual(a.ids.slice(0, 5))
    const rb = await adapter.listProducts(
      { accessToken: 'token-b' },
      withPageSink({ page: 2, limit: 5 } as QueryParams),
    )
    expect(rb.map((r) => r.id)).toEqual(b.ids.slice(5, 10))
  })
})

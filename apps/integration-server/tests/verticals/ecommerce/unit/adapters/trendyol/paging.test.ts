/**
 * Trendyol listCollections paging contract.
 *
 * `GET /integration/product/product-categories` (getCategoryTree) documents
 * only `name` (query), `storefrontcode` and `Accept-Language` (headers). There
 * is no page or size parameter, and the 200 response is a bare array of
 * categories with recursive `subCategories`
 * (https://developers.trendyol.com/reference/getcategorytree.md): "Kategori
 * ağacı belirli aralıklarla güncellenmektedir, haftalık olarak güncel listeyi
 * almanız önerilir."
 *
 * Every request returns the whole tree, so the adapter must flatten it and
 * slice the caller's page locally. The fake upstream below ignores every query
 * parameter, as the real endpoint does.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { QueryParams } from '@opensteward/shared'
import { TrendyolAdapter } from '../../../../../../src/verticals/ecommerce/adapters/trendyol/index'

const CREDS = {
  accessToken: 'api-key',
  extra: { apiSecret: 'api-secret', supplierId: '12345' },
}

interface Call {
  path: string
  params: Record<string, unknown> | undefined
}

interface Cat {
  id: number
  name: string
  parentId?: number
  subCategories: Cat[]
}

/**
 * A category tree of `rows` nodes: roots each carrying up to two children, so
 * the flattened (pre-order) walk is not the same as the root list.
 */
function makeServer(rows: number) {
  const roots: Cat[] = []
  const ids: string[] = []
  let n = 0
  while (n < rows) {
    const root: Cat = { id: 1000 + n, name: `cat-${n}`, subCategories: [] }
    roots.push(root)
    ids.push(String(root.id))
    n++
    for (let c = 0; c < 2 && n < rows; c++) {
      const child: Cat = { id: 1000 + n, name: `cat-${n}`, parentId: root.id, subCategories: [] }
      root.subCategories.push(child)
      ids.push(String(child.id))
      n++
    }
  }
  const calls: Call[] = []
  const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
    calls.push({ path, params: config?.params })
    if (path !== 'integration/product/product-categories')
      throw new Error(`unexpected path in test: ${path}`)
    return { data: roots }
  })
  return { get, calls, ids }
}

function fakeTrendyol(rows: number) {
  const server = makeServer(rows)
  vi.spyOn(axios, 'create').mockReturnValue({ get: server.get, defaults: {} } as never)
  return server
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Trendyol listCollections paging', () => {
  it('serves 2L+1 categories once each, in order, across pages 1..3 with exact hasMore', async () => {
    for (const L of [3, 10, 17]) {
      const { ids } = fakeTrendyol(2 * L + 1)
      const adapter = new TrendyolAdapter()
      const seen: string[] = []
      const hasMore: (boolean | undefined)[] = []
      for (const page of [1, 2, 3]) {
        const params = withPageSink({ page, limit: L } as QueryParams)
        const rows = await adapter.listCollections(CREDS, params)
        seen.push(...rows.map((r) => r.id))
        hasMore.push(readUpstreamPage(params)?.hasMore)
        expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
      }
      expect(seen).toEqual(ids)
      expect(hasMore).toEqual([true, true, false])
      vi.restoreAllMocks()
    }
  })

  it('page 2 sends no undocumented paging parameter and slices the whole tree', async () => {
    const L = 12
    const { calls, ids } = fakeTrendyol(2 * L + 1)
    const adapter = new TrendyolAdapter()
    const params = withPageSink({ page: 2, limit: L } as QueryParams)
    const rows = await adapter.listCollections(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(ids.slice(L, 2 * L))
    expect(readUpstreamPage(params)?.totalCount).toBe(2 * L + 1)
    expect(calls).toHaveLength(1)
    expect(Object.keys(calls[0]!.params ?? {})).toEqual([])
  })

  it('clamps a limit above the router maximum and still serves every row', async () => {
    const first = parseListQuery({ limit: '5000', page: '1' })
    const MAX = first.limit!
    expect(MAX).toBeLessThan(5000)
    const { ids } = fakeTrendyol(2 * MAX + 1)
    const adapter = new TrendyolAdapter()
    const seen: string[] = []
    for (let page = 1; ; page++) {
      expect(page).toBeLessThan(10)
      const params = withPageSink(parseListQuery({ limit: '5000', page: String(page) }))
      const rows = await adapter.listCollections(CREDS, params)
      expect(rows.length).toBeLessThanOrEqual(MAX)
      seen.push(...rows.map((r) => r.id))
      if (!readUpstreamPage(params)?.hasMore) break
    }
    expect(seen).toEqual(ids)
  })

  it('API path: parseListQuery then listPage gives the right meta.hasMore', async () => {
    const { ids } = fakeTrendyol(25)
    const adapter = new TrendyolAdapter()

    const p1 = parseListQuery({ limit: '10', page: '1' })
    const r1 = listPage(await adapter.listCollections(CREDS, p1), p1, 'trendyol')
    expect(r1.data.map((d) => d.id)).toEqual(ids.slice(0, 10))
    expect(r1.meta.hasMore).toBe(true)

    const p3 = parseListQuery({ limit: '10', page: '3' })
    const r3 = listPage(await adapter.listCollections(CREDS, p3), p3, 'trendyol')
    expect(r3.data.map((d) => d.id)).toEqual(ids.slice(20))
    expect(r3.meta.hasMore).toBe(false)
  })
})

describe('Trendyol listLocations paging', () => {
  it('serves the one synthetic location on page 1 only, with hasMore false', async () => {
    const adapter = new TrendyolAdapter()
    const p1 = withPageSink({ page: 1, limit: 10 } as QueryParams)
    const r1 = await adapter.listLocations(CREDS, p1)
    expect(r1.map((l) => l.id)).toEqual(['default'])
    expect(readUpstreamPage(p1)?.hasMore).toBe(false)
    expect(readUpstreamPage(p1)?.pagedLocally).toBe(true)

    const p2 = withPageSink({ page: 2, limit: 10 } as QueryParams)
    expect(await adapter.listLocations(CREDS, p2)).toEqual([])
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
  })
})

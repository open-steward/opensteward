/**
 * Magento listCollections paging.
 *
 * GET /rest/V1/categories (operationId GetV1Categories,
 * https://adobe-commerce.redoc.ly/2.4.9-admin/tag/categories#operation/GetV1Categories):
 *   "Retrieve list of categories"
 * Its only query parameters are `rootCategoryId` and `depth`; there is no page
 * or size parameter, and the 200 body is one tree root with nested
 * `children_data`: the whole collection. So the adapter flattens the tree and
 * pages it locally. Before this, every page re-sent the same request and
 * served the whole tree again, ignoring the caller's page and limit.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { MagentoAdapter } from '../../../../../../src/verticals/ecommerce/adapters/magento/index'

const CREDS = {
  accessToken: 'h7wybtgltd4ndjqffzsv7rkbgnrkfb0y',
  extra: { baseUrl: 'https://store.example.com' },
}

interface Node {
  id: number
  parent_id: number
  name: string
  is_active: boolean
  position: number
  level: number
  children_data: Node[]
}

/**
 * A category tree of `n` nodes in pre-order ids 1..n: node 1 is the root,
 * nodes 2..n alternate between children of the root and grandchildren, so
 * the flatten walk has nesting to get right.
 */
function tree(n: number): Node {
  const mk = (id: number, parent: number, level: number): Node => ({
    id,
    parent_id: parent,
    name: `Category ${id}`,
    is_active: true,
    position: id,
    level,
    children_data: [],
  })
  const root = mk(1, 0, 0)
  let id = 2
  while (id <= n) {
    const child = mk(id++, 1, 1)
    root.children_data.push(child)
    if (id <= n) child.children_data.push(mk(id++, child.id, 2))
  }
  return root
}

/**
 * A fake Magento serving GET categories with only its documented query
 * parameters, `rootCategoryId` and `depth`. Anything else is refused.
 */
function fakeCategories(n: number) {
  const get = vi.fn(async (p: string, cfg?: { params?: Record<string, unknown> }) => {
    if (p !== 'categories') throw new Error(`unexpected path ${p}`)
    const extra = Object.keys(cfg?.params ?? {}).filter(
      (k) => k !== 'rootCategoryId' && k !== 'depth',
    )
    if (extra.length > 0) throw new Error(`undocumented query parameter(s): ${extra.join(', ')}`)
    return { data: tree(n) }
  })
  vi.spyOn(axios, 'create').mockReturnValue({
    get,
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  } as never)
  return { get }
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => String(i + 1))

afterEach(() => vi.restoreAllMocks())

describe('magento listCollections paging', () => {
  const adapter = () => new MagentoAdapter()

  it.each([1, 3, 7])(
    'pages 1..3 at limit %i serve every category once, in order, with hasMore exact',
    async (limit) => {
      const n = 2 * limit + 1
      fakeCategories(n)
      const seen: string[] = []
      const hasMore: Array<boolean | undefined> = []
      for (let k = 1; k <= 3; k++) {
        const params = withPageSink({ page: k, limit })
        const rows = await adapter().listCollections(CREDS, params)
        expect(rows.length).toBe(k < 3 ? limit : 1)
        seen.push(...rows.map((r) => r.id))
        hasMore.push(readUpstreamPage(params)?.hasMore)
        expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
        expect(readUpstreamPage(params)?.totalCount).toBe(n)
      }
      expect(seen).toEqual(ids(n))
      expect(hasMore).toEqual([true, true, false])
    },
  )

  it('page 2 sends only documented parameters and does not repeat page 1', async () => {
    const { get } = fakeCategories(5)
    const p1 = await adapter().listCollections(CREDS, withPageSink({ page: 1, limit: 2 }))
    const p2 = await adapter().listCollections(CREDS, withPageSink({ page: 2, limit: 2 }))
    expect(p1.map((r) => r.id)).toEqual(['1', '2'])
    expect(p2.map((r) => r.id)).toEqual(['3', '4'])
    for (const call of get.mock.calls) {
      expect(Object.keys(call[1]?.params ?? {})).toEqual([])
    }
  })

  it('a limit above the sync ceiling still serves every category, once', async () => {
    fakeCategories(601)
    const p1 = withPageSink({ page: 1, limit: 1000 })
    const p2 = withPageSink({ page: 2, limit: 1000 })
    expect((await adapter().listCollections(CREDS, p1)).map((r) => r.id)).toEqual(ids(601))
    expect(await adapter().listCollections(CREDS, p2)).toEqual([])
    expect(readUpstreamPage(p1)?.hasMore).toBe(false)
  })

  it('with no limit, a direct caller gets the whole tree and hasMore false', async () => {
    fakeCategories(9)
    const params = withPageSink({})
    const rows = await adapter().listCollections(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(ids(9))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(readUpstreamPage(params)?.totalCount).toBe(9)
  })

  it('through the API path, page 1 of 5 at limit 2 says hasMore true', async () => {
    fakeCategories(5)
    const params: QueryParams = withPageSink(parseListQuery({ page: '1', limit: '2' }))
    const env = listPage(await adapter().listCollections(CREDS, params), params, 'magento')
    expect(env.data.map((r) => r.id)).toEqual(['1', '2'])
    expect(env.meta.hasMore).toBe(true)
    expect(env.meta.totalCount).toBe(5)
  })

  it('through the API path, the last page says hasMore false', async () => {
    fakeCategories(5)
    const params: QueryParams = withPageSink(parseListQuery({ page: '3', limit: '2' }))
    const env = listPage(await adapter().listCollections(CREDS, params), params, 'magento')
    expect(env.data.map((r) => r.id)).toEqual(['5'])
    expect(env.meta.hasMore).toBe(false)
  })
})

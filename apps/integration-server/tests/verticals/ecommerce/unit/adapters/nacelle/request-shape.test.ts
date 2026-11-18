/**
 * Request-shape + pagination tests for the Nacelle Storefront GraphQL client.
 * Endpoint/auth verified against:
 *   https://docs.nacelle.com/docs/storefront-graphql-api-stable
 *   https://docs.nacelle.com/docs/auth-storefront
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios, { type AxiosInstance, type CreateAxiosDefaults } from 'axios'
import { withPageSink, readUpstreamPage, _resetCursorPager } from '@opensteward/shared'
import { NacelleAdapter } from '../../../../../../src/verticals/ecommerce/adapters/nacelle/index'

const CREDS = { accessToken: 'pat_abcdef', extra: { spaceId: 'space_123' } }

interface Call {
  url: string
  body: { query: string; variables: Record<string, unknown> }
  headers: Record<string, string>
}

function fakeStorefront(
  answer: (variables: Record<string, unknown>) => { edges: unknown[]; hasNextPage: boolean; endCursor?: string },
  rootField: 'allProducts' | 'allProductCollections' = 'allProducts',
) {
  const calls: Call[] = []
  let capturedHeaders: Record<string, string> = {}
  const post = vi.fn(async (url: string, body: { query: string; variables: Record<string, unknown> }) => {
    calls.push({ url, body, headers: capturedHeaders })
    const { edges, hasNextPage, endCursor } = answer(body.variables)
    return { data: { data: { [rootField]: { pageInfo: { hasNextPage, endCursor }, edges } } } }
  })
  vi.spyOn(axios, 'create').mockImplementation((cfg?: CreateAxiosDefaults) => {
    capturedHeaders = (cfg?.headers as Record<string, string>) ?? {}
    return { post } as unknown as AxiosInstance
  })
  return calls
}

const product = (i: number) => ({
  nacelleEntryId: `prod_${i}`,
  variants: [],
  content: [{ title: `P${i}` }],
})

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe('NacelleAdapter — Storefront GraphQL request shape', () => {
  it('posts to the space-scoped GraphQL endpoint with a Bearer token', async () => {
    const calls = fakeStorefront(() => ({ edges: [], hasNextPage: false }))
    const adapter = new NacelleAdapter()
    await adapter.listProducts(CREDS, withPageSink({ page: 1, limit: 10 }))

    expect(calls).toHaveLength(1)
    expect(calls[0]!.headers['Authorization']).toBe('Bearer pat_abcdef')
    // baseURL is set on axios.create; the request itself is posted to ''.
    expect(calls[0]!.url).toBe('')
  })

  it('sends allProducts with a first/after filter and reads pageInfo.hasNextPage back', async () => {
    const total = 5
    const calls = fakeStorefront((vars) => {
      const after = vars['after'] as string | undefined
      const start = after ? Number(after) : 0
      const first = Number(vars['first'])
      const rows = Array.from({ length: Math.min(first, total - start) }, (_, i) => ({
        node: product(start + i),
      }))
      const nextStart = start + rows.length
      return { edges: rows, hasNextPage: nextStart < total, endCursor: String(nextStart) }
    })
    const adapter = new NacelleAdapter()

    const p1 = withPageSink({ page: 1, limit: 2 })
    const items1 = await adapter.listProducts(CREDS, p1)
    expect(items1.map((p) => p.id)).toEqual(['prod_0', 'prod_1'])
    expect(readUpstreamPage(p1)?.hasMore).toBe(true)

    const p2 = withPageSink({ page: 2, limit: 2 })
    const items2 = await adapter.listProducts(CREDS, p2)
    expect(items2.map((p) => p.id)).toEqual(['prod_2', 'prod_3'])
    expect(readUpstreamPage(p2)?.hasMore).toBe(true)

    expect(calls.map((c) => c.body.variables['after'])).toEqual([undefined, '2'])
    expect(calls.every((c) => c.body.query.includes('allProducts'))).toBe(true)
  })

  it('getProduct filters by nacelleEntryIds', async () => {
    const calls = fakeStorefront((vars) => {
      const ids = vars['nacelleEntryIds'] as string[]
      return { edges: [{ node: product(0) }].filter(() => ids?.[0] === 'prod_0'), hasNextPage: false }
    })
    const adapter = new NacelleAdapter()
    const p = await adapter.getProduct(CREDS, 'prod_0')
    expect(p.id).toBe('prod_0')
    expect(calls[0]!.body.variables['nacelleEntryIds']).toEqual(['prod_0'])
  })

  it('two spaces never share cursors', async () => {
    const total = 4
    const calls = fakeStorefront((vars) => {
      const after = vars['after'] as string | undefined
      const start = after ? Number(after) : 0
      const first = Number(vars['first'])
      const rows = Array.from({ length: Math.min(first, total - start) }, (_, i) => ({
        node: product(start + i),
      }))
      const nextStart = start + rows.length
      return { edges: rows, hasNextPage: nextStart < total, endCursor: String(nextStart) }
    })
    const adapter = new NacelleAdapter()
    await adapter.listProducts(
      { accessToken: 't1', extra: { spaceId: 'space_a' } },
      { page: 1, limit: 2 },
    )
    await adapter.listProducts(
      { accessToken: 't2', extra: { spaceId: 'space_b' } },
      { page: 2, limit: 2 },
    )
    // space_b has no remembered cursor for page 2, so it walks from its own page 1.
    expect(calls.map((c) => c.body.variables['after'])).toEqual([undefined, undefined, '2'])
  })

  it('listCollections queries allProductCollections', async () => {
    const calls = fakeStorefront(
      () => ({ edges: [{ node: { nacelleEntryId: 'col_1', content: [{ title: 'C1' }] } }], hasNextPage: false }),
      'allProductCollections',
    )
    const adapter = new NacelleAdapter()
    const cols = await adapter.listCollections(CREDS, withPageSink({ page: 1, limit: 10 }))
    expect(cols.map((c) => c.id)).toEqual(['col_1'])
    expect(calls[0]!.body.query).toContain('allProductCollections')
  })

  it('throws a readable error when spaceId is missing', async () => {
    const adapter = new NacelleAdapter()
    await expect(adapter.listProducts({ accessToken: 't' }, { limit: 10 })).rejects.toThrow(/spaceId/)
  })
})

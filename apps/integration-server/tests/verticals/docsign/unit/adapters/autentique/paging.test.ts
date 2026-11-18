import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { AutentiqueClient } from '../../../../../../src/verticals/docsign/adapters/autentique/client'
import { AutentiqueAdapter } from '../../../../../../src/verticals/docsign/adapters/autentique'

/**
 * Autentique lists documents with the GraphQL query
 * `documents(limit: 60, page: 1) { total data { … } }`
 * (https://docs.autentique.com.br/api/queries/resgatando-documentos). The
 * paging arguments are `limit` and a 1-based `page`; `total` is the count
 * across every page, which is the only end-of-collection signal documented for
 * this query. The fake below honours exactly those two arguments.
 */

const CREDS = { accessToken: 'tok' } as Credentials
const L = 2
const N = 2 * L + 1
const IDS = Array.from({ length: N }, (_, i) => `doc-${i}`)

function row(i: number) {
  return {
    id: `doc-${i}`,
    name: `Doc ${i}`,
    created_at: `2026-01-${String(10 + i).padStart(2, '0')}T00:00:00.000Z`,
    signatures: [],
  }
}

type Vars = { limit?: number; page?: number } | undefined

/** Honours only `limit` and `page`; a missing page is page 1 upstream. */
function mockDocuments(n: number) {
  return vi
    .spyOn(AutentiqueClient.prototype, 'query')
    .mockImplementation(async (query: string, variables?: Record<string, unknown>) => {
      if (!/documents\(/.test(query)) throw new Error(`unexpected query ${query}`)
      const v = variables as Vars
      const limit = v?.limit ?? 60
      const page = v?.page ?? 1
      const start = (page - 1) * limit
      const data = Array.from({ length: n }, (_, i) => row(i)).slice(start, start + limit)
      return { documents: { total: n, data } } as never
    })
}

afterEach(() => vi.restoreAllMocks())

const adapter = new AutentiqueAdapter({ clientId: '', clientSecret: '', redirectUri: '' })

describe('AutentiqueAdapter.listEnvelopes pages by documents(limit, page)', () => {
  it('pages 1..3 return every id once, in order, with an exact hasMore', async () => {
    mockDocuments(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listEnvelopes(CREDS, params)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
    }
    expect(seen).toEqual(IDS)
    expect(more).toEqual([true, true, false])
  })

  it('the page-2 request carries the documented page and limit arguments', async () => {
    const q = mockDocuments(N)
    await adapter.listEnvelopes(CREDS, withPageSink({ page: 2, limit: L }))
    const [query, vars] = q.mock.calls[0]!
    expect(query).toMatch(/documents\(limit: \$limit, page: \$page\)/)
    expect(query).toMatch(/\btotal\b/)
    expect(vars).toEqual({ limit: L, page: 2 })
  })

  it('a total that is an exact multiple of the limit ends on the last full page', async () => {
    mockDocuments(2 * L)
    const params = withPageSink({ page: 2, limit: L })
    const rows = await adapter.listEnvelopes(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(['doc-2', 'doc-3'])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    mockDocuments(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const rows = await adapter.listEnvelopes(CREDS, params)
    const env = listPage(rows, params, 'autentique')
    expect(env.data.map((r) => r.id)).toEqual(IDS.slice(L, 2 * L))
    expect(env.meta.page).toBe(2)
    expect(env.meta.limit).toBe(L)
    expect(env.meta.totalCount).toBe(N)
    expect(env.meta.hasMore).toBe(true)
  })

  it('the API first page, with no page param, asks upstream for page 1', async () => {
    const q = mockDocuments(N)
    const params = parseListQuery({ limit: String(L) })
    const rows = await adapter.listEnvelopes(CREDS, params)
    expect(q.mock.calls[0]![1]).toEqual({ limit: L, page: 1 })
    expect(rows.map((r) => r.id)).toEqual(['doc-0', 'doc-1'])
  })

  it('a short upstream page before the end does not end the walk early', async () => {
    // Models an undocumented upstream cap: pages are CAP rows whatever limit
    // is asked for. hasMore must count rows actually served, not page * limit.
    const CAP = 2
    const TOTAL = 6
    vi.spyOn(AutentiqueClient.prototype, 'query').mockImplementation(
      async (_query: string, variables?: Record<string, unknown>) => {
        const page = (variables as Vars)?.page ?? 1
        const start = (page - 1) * CAP
        const data = Array.from({ length: TOTAL }, (_, i) => row(i)).slice(start, start + CAP)
        return { documents: { total: TOTAL, data } } as never
      },
    )
    const seen: string[] = []
    for (let page = 1; page <= 10; page++) {
      const params = withPageSink({ page, limit: 3 })
      const rows = await adapter.listEnvelopes(CREDS, params)
      seen.push(...rows.map((r) => r.id))
      if (!readUpstreamPage(params)?.hasMore) break
    }
    expect(seen).toEqual(Array.from({ length: TOTAL }, (_, i) => `doc-${i}`))
  })
})

import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { SignaturelyClient } from '../../../../../../src/verticals/docsign/adapters/signaturely/client'
import { SignaturelyAdapter } from '../../../../../../src/verticals/docsign/adapters/signaturely'
import { MAX_PAGE_SIZE } from '../../../../../../src/verticals/docsign/adapters/signaturely/constants'

/**
 * `GET /api/v1/documents/:documentId/signers` takes only the `documentId`
 * path parameter and answers `{ data: [...] }` with the whole signer list
 * (https://docs.signaturely.com/, "Get signer list"). Documents (files) are
 * the `parts` of one document from `GET /api/v1/documents`, which pages with
 * the required `page` + `limit` and reports `totalPages`/`currentPage`
 * ("Get document list"). Neither per-envelope collection has an upstream page
 * to ask for, so the adapter pages it itself, or page 2 repeats page 1.
 */

const CREDS = { accessToken: 'tok' } as Credentials
const DOC = 'doc-target'
const L = 2
const N = 2 * L + 1

const signers = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `sgn-${i}`,
    name: `Signer ${i}`,
    email: `s${i}@example.com`,
    order: i + 1,
    role: null,
  }))

const parts = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `part-${i}`,
    order: i,
    originalFileName: `f${i}.pdf`,
  }))

/**
 * Honours only the documented parameters: the signer list takes none, the
 * document list requires `page` + `limit` and reports `totalPages`. The
 * target document sits on upstream page `targetPage` of `totalPages`.
 */
function mockApi(
  n: number,
  opts: {
    targetPage?: number
    totalPages?: number
    omitTotalPages?: boolean
    lastPage?: number
  } = {},
) {
  const targetPage = opts.targetPage ?? 1
  const totalPages = opts.totalPages ?? Math.max(1, targetPage)
  const lastPage = opts.lastPage ?? totalPages
  return vi
    .spyOn(SignaturelyClient.prototype, 'get')
    .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      if (path === `/documents/${DOC}/signers`) {
        if (params !== undefined) throw new Error('get-signer-list takes no query params')
        return { data: signers(n) } as never
      }
      if (path === '/documents') {
        const page = params?.['page']
        const limit = params?.['limit']
        if (typeof page !== 'number' || typeof limit !== 'number') {
          throw new Error('get-document-list requires page and limit')
        }
        const data =
          page === targetPage
            ? [
                { id: 'other', parts: parts(1) },
                { id: DOC, parts: parts(n) },
              ]
            : page <= lastPage
              ? [{ id: `other-${page}`, parts: parts(1) }]
              : []
        return (
          opts.omitTotalPages
            ? { data, currentPage: page, itemsPerPage: limit }
            : { data, currentPage: page, totalPages, itemsPerPage: limit }
        ) as never
      }
      throw new Error(`unexpected path ${path}`)
    })
}

afterEach(() => vi.restoreAllMocks())

const adapter = new SignaturelyAdapter()

type Lister = (c: Credentials, id: string, p: QueryParams) => Promise<Array<{ id: string }>>
const METHODS: Array<[string, Lister, (n: number) => string[]]> = [
  [
    'listSigners',
    (c, id, p) => adapter.listSigners(c, id, p),
    (n) => Array.from({ length: n }, (_, i) => `sgn-${i}`),
  ],
  [
    'listDocuments',
    (c, id, p) => adapter.listDocuments(c, id, p),
    (n) => Array.from({ length: n }, (_, i) => `part-${i}`),
  ],
]

describe.each(METHODS)(
  'SignaturelyAdapter.%s pages the whole collection locally',
  (_name, list, idsOf) => {
    const ids = idsOf(N)

    it('pages 1..3 return every id once, in order, with an exact hasMore', async () => {
      mockApi(N)
      const seen: string[] = []
      const more: Array<boolean | undefined> = []
      for (const page of [1, 2, 3]) {
        const params = withPageSink({ page, limit: L })
        const rows = await list(CREDS, DOC, params)
        seen.push(...rows.map((r) => r.id))
        more.push(readUpstreamPage(params)?.hasMore)
        expect(readUpstreamPage(params)?.totalCount).toBe(N)
        expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
      }
      expect(seen).toEqual(ids)
      expect(more).toEqual([true, true, false])
    })

    it('page 2 is not page 1', async () => {
      mockApi(N)
      const p1 = await list(CREDS, DOC, withPageSink({ page: 1, limit: L }))
      const p2 = await list(CREDS, DOC, withPageSink({ page: 2, limit: L }))
      expect(p2.map((r) => r.id)).toEqual(ids.slice(L, 2 * L))
      expect(p2.map((r) => r.id)).not.toEqual(p1.map((r) => r.id))
    })

    it('a limit above the collection size serves everything once, with no next page', async () => {
      mockApi(N)
      const params = parseListQuery({ page: '1', limit: '100000' })
      const rows = await list(CREDS, DOC, params)
      expect(rows.map((r) => r.id)).toEqual(ids)
      expect(readUpstreamPage(params)?.hasMore).toBe(false)
    })

    it('without a limit returns the whole collection (used by the get* lookups)', async () => {
      mockApi(N)
      const rows = await list(CREDS, DOC, {})
      expect(rows.map((r) => r.id)).toEqual(ids)
    })

    it('serves page 2 on the API path through parseListQuery and listPage', async () => {
      mockApi(N)
      const params = parseListQuery({ page: '2', limit: String(L) })
      const rows = await list(CREDS, DOC, params)
      const env = listPage(rows, params, 'signaturely')
      expect(env.data.map((r) => r.id)).toEqual(ids.slice(L, 2 * L))
      expect(env.meta.page).toBe(2)
      expect(env.meta.limit).toBe(L)
      expect(env.meta.totalCount).toBe(N)
      expect(env.meta.hasMore).toBe(true)
    })
  },
)

describe('SignaturelyAdapter.listDocuments resolves the envelope on any upstream page', () => {
  it('walks the document list with the documented page key until it finds the envelope', async () => {
    const get = mockApi(N, { targetPage: 3, totalPages: 4 })
    const params = withPageSink({ page: 1, limit: N })
    const rows = await adapter.listDocuments(CREDS, DOC, params)
    expect(rows.map((r) => r.id)).toEqual(Array.from({ length: N }, (_, i) => `part-${i}`))
    const pages = get.mock.calls.map((c) => (c[1] as Record<string, unknown>)['page'])
    expect(pages).toEqual([1, 2, 3])
  })

  it('stops at totalPages when the envelope is absent, a known end', async () => {
    const get = mockApi(N, { targetPage: 99, totalPages: 3 })
    const params = withPageSink({ page: 1, limit: L })
    const rows = await adapter.listDocuments(CREDS, 'missing', params)
    expect(rows).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(readUpstreamPage(params)?.totalCount).toBe(0)
    expect(get.mock.calls.map((c) => (c[1] as Record<string, unknown>)['page'])).toEqual([1, 2, 3])
  })

  it('sends the same upstream limit on every walked page', async () => {
    const get = mockApi(N, { targetPage: 3, totalPages: 4 })
    await adapter.listDocuments(CREDS, DOC, withPageSink({ page: 1, limit: L }))
    const limits = get.mock.calls.map((c) => (c[1] as Record<string, unknown>)['limit'])
    expect(limits).toEqual([MAX_PAGE_SIZE, MAX_PAGE_SIZE, MAX_PAGE_SIZE])
  })

  it('stops on an empty upstream page even if totalPages says more', async () => {
    const get = mockApi(N, { targetPage: 99, totalPages: 10, lastPage: 1 })
    const params = withPageSink({ page: 1, limit: L })
    const rows = await adapter.listDocuments(CREDS, 'missing', params)
    expect(rows).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(get.mock.calls.map((c) => (c[1] as Record<string, unknown>)['page'])).toEqual([1, 2])
  })

  it('stops after page 1 when the response has no totalPages, and claims nothing', async () => {
    const get = mockApi(N, { targetPage: 99, totalPages: 5, omitTotalPages: true })
    const params = withPageSink({ page: 1, limit: L })
    const rows = await adapter.listDocuments(CREDS, 'missing', params)
    expect(rows).toEqual([])
    expect(readUpstreamPage(params)?.pagedLocally).toBeUndefined()
    expect(get.mock.calls.map((c) => (c[1] as Record<string, unknown>)['page'])).toEqual([1])
  })
})

describe('SignaturelyAdapter get* lookups still see the whole collection', () => {
  it('getSigner finds the last signer and getDocument the last part', async () => {
    mockApi(N)
    const s = await adapter.getSigner(CREDS, `${DOC}:sgn-${N - 1}`)
    expect(s.externalId).toBe(`sgn-${N - 1}`)
    const d = await adapter.getDocument(CREDS, `${DOC}:part-${N - 1}`)
    expect(d.externalId).toBe(`part-${N - 1}`)
  })
})

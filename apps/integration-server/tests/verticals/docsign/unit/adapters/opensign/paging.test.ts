/**
 * Paging for OpenSign's per-envelope child lists.
 *
 * `GET /document/:document_id` takes only the path id and returns the whole
 * document, its signer and audit-trail arrays embedded
 * (https://docs.opensignlabs.com/docs/API-docs/v1.2/getdocument: "The Get
 * Document API enables you to retrieve details about a specific document.";
 * the only documented parameter is the `document_id` path segment). There is
 * no paging parameter, so signers, documents and audit-trail entries are the
 * whole collection and are paged locally. They used to return every row on
 * every page, so page 2 repeated page 1.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import {
  withPageSink,
  readUpstreamPage,
  parseListQuery,
  listPage,
  _resetRowPager,
} from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { OpensignClient } from '../../../../../../src/verticals/docsign/adapters/opensign/client'
import { OpensignAdapter } from '../../../../../../src/verticals/docsign/adapters/opensign'

const CREDS = { accessToken: 'tok' } as Credentials
const ENV = 'env-1'
const adapter = new OpensignAdapter()

beforeEach(() => _resetRowPager())
afterEach(() => vi.restoreAllMocks())

/**
 * A fake `GET /document/:document_id` holding `n` signers and `n` audit
 * entries. It honours ONLY the documented path id; every query parameter is
 * ignored, as the endpoint documents none.
 */
function mockDocument(n: number) {
  return vi.spyOn(OpensignClient.prototype, 'get').mockImplementation(async (path: string) => {
    if (path !== `/document/${ENV}`) throw new Error(`unexpected path ${path}`)
    return {
      objectId: ENV,
      Name: 'Doc',
      Signers: Array.from({ length: n }, (_, i) => ({
        objectId: `s-${i}`,
        Name: `S${i}`,
        Email: `s${i}@example.com`,
      })),
      AuditTrail: Array.from({ length: n }, (_, i) => ({
        objectId: `a-${i}`,
        Activity: 'Viewed',
        ViewedOn: '2026-01-01T00:00:00.000Z',
      })),
    } as never
  })
}

type ChildLister = (c: Credentials, p: QueryParams) => Promise<Array<{ id: string }>>
const CHILDREN: Array<[string, ChildLister, (i: number) => string]> = [
  ['listSigners', (c, p) => adapter.listSigners(c, ENV, p), (i) => `s-${i}`],
  [
    'listAuditTrailEntries',
    (c, p) => adapter.listAuditTrailEntries(c, ENV, p),
    (i) => `${ENV}:a-${i}`,
  ],
]

describe.each(CHILDREN)(
  'OpensignAdapter.%s pages GET /document/:id locally',
  (_name, list, idOf) => {
    const L = 2
    const N = 2 * L + 1
    const ids = (n: number) => Array.from({ length: n }, (_, i) => idOf(i))

    it('with N = 2L+1 rows, pages 1..3 return every id once with an exact hasMore', async () => {
      const get = mockDocument(N)
      const seen: string[] = []
      const more: Array<boolean | undefined> = []
      for (const page of [1, 2, 3]) {
        const params = withPageSink({ page, limit: L })
        const rows = await list(CREDS, params)
        seen.push(...rows.map((r) => r.id))
        more.push(readUpstreamPage(params)?.hasMore)
        expect(readUpstreamPage(params)?.totalCount).toBe(N)
        expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
      }
      expect(seen).toEqual(ids(N))
      expect(more).toEqual([true, true, false])
      // The endpoint documents no paging parameter, so none is sent.
      for (const c of get.mock.calls) expect(c).toEqual([`/document/${ENV}`])
    })

    it('page 2 is not page 1', async () => {
      mockDocument(N)
      const p1 = await list(CREDS, withPageSink({ page: 1, limit: L }))
      const p2 = await list(CREDS, withPageSink({ page: 2, limit: L }))
      expect(p1.map((r) => r.id)).toEqual([idOf(0), idOf(1)])
      expect(p2.map((r) => r.id)).toEqual([idOf(2), idOf(3)])
    })

    it('a large limit returns the whole embedded array and ends', async () => {
      mockDocument(N)
      const params = withPageSink({ page: 1, limit: 500 })
      expect((await list(CREDS, params)).map((r) => r.id)).toEqual(ids(N))
      expect(readUpstreamPage(params)?.hasMore).toBe(false)
    })

    it('pages the whole embedded array even past 500 rows (no truncation)', async () => {
      // 1,203 rows at the sync limit of 500: page 3 must hold the last 203,
      // so a truncated "whole collection" fails here.
      const big = 1203
      mockDocument(big)
      const p3 = withPageSink({ page: 3, limit: 500 })
      const rows = await list(CREDS, p3)
      expect(rows.map((r) => r.id)).toEqual(ids(big).slice(1000))
      expect(readUpstreamPage(p3)?.totalCount).toBe(big)
      expect(readUpstreamPage(p3)?.hasMore).toBe(false)
      const p2 = withPageSink({ page: 2, limit: 500 })
      expect((await list(CREDS, p2)).map((r) => r.id)).toEqual(ids(big).slice(500, 1000))
      expect(readUpstreamPage(p2)?.hasMore).toBe(true)
      expect(await list(CREDS, {})).toHaveLength(big)
    })

    it('without a limit returns every row', async () => {
      mockDocument(N)
      expect(await list(CREDS, {})).toHaveLength(N)
    })

    it('serves page 2 on the API path through parseListQuery and listPage', async () => {
      mockDocument(N)
      const params = parseListQuery({ page: '2', limit: String(L) })
      const rows = await list(CREDS, params)
      const env = listPage(rows, params, 'opensign')
      expect(env.data.map((r) => r.id)).toEqual([idOf(2), idOf(3)])
      expect(env.meta.page).toBe(2)
      expect(env.meta.totalCount).toBe(N)
      expect(env.meta.hasMore).toBe(true)
    })
  },
)

describe('OpensignAdapter.listDocuments pages its one document locally', () => {
  it('page 1 holds the one document and page 2 is empty', async () => {
    mockDocument(0)
    const p1 = withPageSink({ page: 1, limit: 1 })
    expect((await adapter.listDocuments(CREDS, ENV, p1)).map((d) => d.id)).toEqual([ENV])
    expect(readUpstreamPage(p1)?.hasMore).toBe(false)
    const p2 = withPageSink({ page: 2, limit: 1 })
    expect(await adapter.listDocuments(CREDS, ENV, p2)).toEqual([])
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    mockDocument(0)
    const params = parseListQuery({ page: '2', limit: '1' })
    const rows = await adapter.listDocuments(CREDS, ENV, params)
    const env = listPage(rows, params, 'opensign')
    expect(env.data).toEqual([])
    expect(env.meta.hasMore).toBe(false)
  })
})

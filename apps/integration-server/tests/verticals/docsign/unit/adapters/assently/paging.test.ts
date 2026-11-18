import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { AssentlyClient } from '../../../../../../src/verticals/docsign/adapters/assently/client'
import { AssentlyAdapter } from '../../../../../../src/verticals/docsign/adapters/assently'

/**
 * Signers, documents and audit-trail entries all come from
 * `GET /api/cases/{caseid}`, whose only parameter is the case id: the reply
 * carries the case's whole `parties[]` and `documents[]` arrays
 * (https://test.assently.com/apiv3/swagger/docs/v3). There is no upstream page
 * to ask for, so the adapter must page the collection itself, or page 2
 * repeats page 1.
 */

const CREDS = { accessToken: 'tok' } as Credentials
const CASE_ID = 'case-1'
const L = 2
const N = 2 * L + 1

function fakeCase(n: number) {
  const parties = Array.from({ length: n }, (_, i) => ({
    id: `pty-${i}`,
    name: `Party ${i}`,
    emailAddress: `p${i}@example.com`,
    signedOn: `2026-01-${String(10 + i).padStart(2, '0')}T00:00:00.000Z`,
  }))
  const documents = Array.from({ length: n }, (_, i) => ({
    id: `doc-${i}`,
    filename: `doc-${i}.pdf`,
  }))
  return { caseId: CASE_ID, parties, documents }
}

/** Honours only the documented path parameter; ignores every query param. */
function mockGetCase(n: number) {
  return vi.spyOn(AssentlyClient.prototype, 'get').mockImplementation(async (path: string) => {
    if (path !== `/api/cases/${CASE_ID}`) throw new Error(`unexpected path ${path}`)
    return fakeCase(n) as never
  })
}

afterEach(() => vi.restoreAllMocks())

const adapter = new AssentlyAdapter()

type Lister = (c: Credentials, id: string, p: QueryParams) => Promise<Array<{ id: string }>>
const METHODS: Array<[string, Lister, string[]]> = [
  [
    'listSigners',
    (c, id, p) => adapter.listSigners(c, id, p),
    Array.from({ length: N }, (_, i) => `${CASE_ID}:pty-${i}`),
  ],
  [
    'listDocuments',
    (c, id, p) => adapter.listDocuments(c, id, p),
    Array.from({ length: N }, (_, i) => `${CASE_ID}:doc-${i}`),
  ],
  [
    'listAuditTrailEntries',
    (c, id, p) => adapter.listAuditTrailEntries(c, id, p),
    // One synthesised `signed` event per party; indices span the whole case.
    Array.from({ length: N }, (_, i) => `${CASE_ID}:${i}`),
  ],
]

describe.each(METHODS)('AssentlyAdapter.%s pages the whole case locally', (_name, list, ids) => {
  it('pages 1..3 return every id once, in order, with an exact hasMore', async () => {
    const get = mockGetCase(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await list(CREDS, CASE_ID, params)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    expect(seen).toEqual(ids)
    expect(more).toEqual([true, true, false])
    // The endpoint takes no paging parameter; every page asks for the case.
    for (const call of get.mock.calls) expect(call).toEqual([`/api/cases/${CASE_ID}`])
  })

  it('page 2 is not page 1', async () => {
    mockGetCase(N)
    const p1 = await list(CREDS, CASE_ID, withPageSink({ page: 1, limit: L }))
    const p2 = await list(CREDS, CASE_ID, withPageSink({ page: 2, limit: L }))
    expect(p2.map((r) => r.id)).toEqual(ids.slice(L, 2 * L))
    expect(p2.map((r) => r.id)).not.toEqual(p1.map((r) => r.id))
  })

  it('without a limit returns the whole collection (used by the get* lookups)', async () => {
    mockGetCase(N)
    const rows = await list(CREDS, CASE_ID, {})
    expect(rows.map((r) => r.id)).toEqual(ids)
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    mockGetCase(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const rows = await list(CREDS, CASE_ID, params)
    const env = listPage(rows, params, 'assently')
    expect(env.data.map((r) => r.id)).toEqual(ids.slice(L, 2 * L))
    expect(env.meta.page).toBe(2)
    expect(env.meta.limit).toBe(L)
    expect(env.meta.totalCount).toBe(N)
    expect(env.meta.hasMore).toBe(true)
  })
})

describe('AssentlyAdapter.listDocuments pages after mapping', () => {
  it('keeps index-derived ids and order global when documents carry no id', async () => {
    vi.spyOn(AssentlyClient.prototype, 'get').mockImplementation(async (path: string) => {
      if (path !== `/api/cases/${CASE_ID}`) throw new Error(`unexpected path ${path}`)
      const documents = Array.from({ length: N }, (_, i) => ({ filename: `doc-${i}.pdf` }))
      return { caseId: CASE_ID, parties: [], documents } as never
    })
    const p1 = await adapter.listDocuments(CREDS, CASE_ID, withPageSink({ page: 1, limit: L }))
    const p2 = await adapter.listDocuments(CREDS, CASE_ID, withPageSink({ page: 2, limit: L }))
    expect(p1.map((d) => d.id)).toEqual([`${CASE_ID}:0`, `${CASE_ID}:1`])
    expect(p2.map((d) => d.id)).toEqual([`${CASE_ID}:2`, `${CASE_ID}:3`])
    expect(p2.map((d) => d.order)).toEqual([2, 3])
  })
})

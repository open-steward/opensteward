import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { BreezedocClient } from '../../../../../../src/verticals/docsign/adapters/breezedoc/client'
import { BreezedocAdapter } from '../../../../../../src/verticals/docsign/adapters/breezedoc'

/**
 * Documents (`document_files`) and audit-trail entries (synthesised from
 * `created_at` and each recipient's timestamps) both come from
 * `GET /documents/{document}` ("Get a specific document"), whose only
 * parameter is the `document` path id: the Document carries its whole
 * `document_files` and `recipients` arrays
 * (https://breezedoc.com/developer/docs/). There is no upstream page to ask
 * for, so the adapter must page the collection itself, or page 2 repeats
 * page 1.
 */

const CREDS = { accessToken: 'tok' } as Credentials
const DOC = '42'
const L = 2
const N = 2 * L + 1

/**
 * A document whose `document_files` has `n` entries and whose timeline
 * synthesises exactly `n` audit events: `created_at` plus `n - 1` recipients
 * that were sent to but never opened or completed.
 */
function fakeDocument(n: number) {
  const pad = (i: number) => String(i).padStart(6, '0')
  return {
    id: Number(DOC),
    title: 'Contract',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    document_files: Array.from({ length: n }, (_, i) => ({
      id: `f-${i}`,
      document_file_pages: [],
    })),
    recipients: Array.from({ length: n - 1 }, (_, i) => ({
      id: i + 1,
      email: `r${i}@example.com`,
      name: `Recipient ${i}`,
      party: i + 1,
      owner: false,
      // Strictly increasing and after created_at, so the sorted order is fixed.
      sent_at: `2026-01-02T00:00:00.${pad(i)}Z`,
      opened_at: null,
      completed_at: null,
    })),
  }
}

/** Honours only the documented path; any query parameter is a bug here. */
function mockGetDocument(n: number) {
  return vi
    .spyOn(BreezedocClient.prototype, 'get')
    .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      if (path !== `/documents/${DOC}`) throw new Error(`unexpected path ${path}`)
      if (params !== undefined) throw new Error('getDocument takes no paging params')
      return fakeDocument(n) as never
    })
}

afterEach(() => vi.restoreAllMocks())

const adapter = new BreezedocAdapter({ clientId: '', clientSecret: '', redirectUri: '' })

type Lister = (c: Credentials, id: string, p: QueryParams) => Promise<Array<{ id: string }>>
const idsFor = (name: string, n: number) =>
  name === 'listDocuments'
    ? Array.from({ length: n }, (_, i) => `${DOC}:f-${i}`)
    : Array.from({ length: n }, (_, i) => `${DOC}:${i}`)

const METHODS: Array<[string, Lister]> = [
  ['listDocuments', (c, id, p) => adapter.listDocuments(c, id, p)],
  ['listAuditTrailEntries', (c, id, p) => adapter.listAuditTrailEntries(c, id, p)],
]

describe.each(METHODS)('BreezedocAdapter.%s pages the whole document locally', (name, list) => {
  const ids = idsFor(name, N)

  it('pages 1..3 return every id once, in order, with an exact hasMore', async () => {
    const get = mockGetDocument(N)
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
    // The endpoint takes no paging parameter; every page asks for the document.
    for (const call of get.mock.calls) expect(call).toEqual([`/documents/${DOC}`])
  })

  it('page 2 is not page 1', async () => {
    mockGetDocument(N)
    const p1 = await list(CREDS, DOC, withPageSink({ page: 1, limit: L }))
    const p2 = await list(CREDS, DOC, withPageSink({ page: 2, limit: L }))
    expect(p2.map((r) => r.id)).toEqual(ids.slice(L, 2 * L))
    expect(p2.map((r) => r.id)).not.toEqual(p1.map((r) => r.id))
  })

  it('a limit above the collection size serves everything once, with no next page', async () => {
    mockGetDocument(N)
    const params = parseListQuery({ page: '1', limit: '100000' })
    const rows = await list(CREDS, DOC, params)
    expect(rows.map((r) => r.id)).toEqual(ids)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('without a limit returns the whole collection (used by the get* lookups)', async () => {
    mockGetDocument(N)
    const rows = await list(CREDS, DOC, {})
    expect(rows.map((r) => r.id)).toEqual(ids)
  })

  it('pages a document larger than any plausible cap: the last page ends it', async () => {
    const BIG = 1001
    const bigIds = idsFor(name, BIG)
    mockGetDocument(BIG)
    const size = 250
    const last = Math.ceil(BIG / size)
    const params = withPageSink({ page: last, limit: size })
    const rows = await list(CREDS, DOC, params)
    expect(rows.map((r) => r.id)).toEqual(bigIds.slice((last - 1) * size))
    expect(readUpstreamPage(params)?.totalCount).toBe(BIG)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(await list(CREDS, DOC, {})).toHaveLength(BIG)
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    mockGetDocument(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const rows = await list(CREDS, DOC, params)
    const env = listPage(rows, params, 'breezedoc')
    expect(env.data.map((r) => r.id)).toEqual(ids.slice(L, 2 * L))
    expect(env.meta.page).toBe(2)
    expect(env.meta.limit).toBe(L)
    expect(env.meta.totalCount).toBe(N)
    expect(env.meta.hasMore).toBe(true)
  })
})

describe('BreezedocAdapter get* lookups still see the whole document', () => {
  it('getDocument finds the last file and getAuditTrailEntry the last event', async () => {
    mockGetDocument(N)
    const d = await adapter.getDocument(CREDS, `${DOC}:f-${N - 1}`)
    expect(d.id).toBe(`${DOC}:f-${N - 1}`)
    const a = await adapter.getAuditTrailEntry(CREDS, `${DOC}:${N - 1}`)
    expect(a.id).toBe(`${DOC}:${N - 1}`)
  })
})

describe('BreezedocAdapter page contents beyond ids', () => {
  it('listDocuments page 2 keeps each file’s whole-document order and name', async () => {
    mockGetDocument(N)
    const p2 = await adapter.listDocuments(CREDS, DOC, withPageSink({ page: 2, limit: L }))
    expect(p2.map((d) => d.order)).toEqual([L, L + 1])
    expect(p2.map((d) => d.name)).toEqual([`Contract (${L + 1})`, `Contract (${L + 2})`])
  })

  it('listAuditTrailEntries pages the timeline in chronological order, not insertion order', async () => {
    const doc = fakeDocument(N)
    // Recipients arrive newest-first, so an unsorted timeline would page wrong.
    doc.recipients.reverse()
    vi.spyOn(BreezedocClient.prototype, 'get').mockResolvedValue(doc as never)
    const seen: Array<{ id: string; occurredAt: string; actorName?: string }> = []
    for (const page of [1, 2, 3]) {
      seen.push(
        ...(await adapter.listAuditTrailEntries(CREDS, DOC, withPageSink({ page, limit: L }))),
      )
    }
    const times = seen.map((e) => e.occurredAt)
    expect(times).toEqual([...times].sort())
    expect(seen.map((e) => e.id)).toEqual(idsFor('listAuditTrailEntries', N))
    expect(seen.slice(1).map((e) => e.actorName)).toEqual(
      Array.from({ length: N - 1 }, (_, i) => `Recipient ${i}`),
    )
  })
})

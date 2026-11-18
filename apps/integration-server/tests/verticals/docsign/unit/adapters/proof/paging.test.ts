/**
 * Paging for Proof's child list methods.
 *
 * `GET /v1/transactions/{id}` takes only the path `id` and an optional
 * `document_url_version`; it has no limit, offset or page parameter and
 * returns the whole transaction object, with its `signers`, `documents` and
 * `notarization_records` arrays inline
 * (https://dev.proof.com/reference/gettransaction.md: "Retrieves the
 * transaction with a given ID."). Signers, documents and the synthesised
 * audit trail are therefore paged locally. They used to ignore `page`, so
 * page 2 repeated page 1.
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
import { ProofClient } from '../../../../../../src/verticals/docsign/adapters/proof/client'
import { ProofAdapter } from '../../../../../../src/verticals/docsign/adapters/proof'

const CREDS = { accessToken: 'prf_key' } as Credentials
const TX = 'ot_1'
const adapter = new ProofAdapter()

beforeEach(() => _resetRowPager())
afterEach(() => vi.restoreAllMocks())

/**
 * A fake `GET /transactions/{id}` holding `n` signers, `n` documents and
 * enough notarization records for `n` audit events after `created`. It
 * honours ONLY the documented path id; every query parameter is ignored.
 */
function mockTransaction(n: number) {
  return vi.spyOn(ProofClient.prototype, 'get').mockImplementation(async (path: string) => {
    if (path !== `/transactions/${TX}`) throw new Error(`unexpected path ${path}`)
    const at = (i: number) => new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString()
    return {
      id: TX,
      status: 'started',
      date_created: at(0),
      signers: Array.from({ length: n }, (_, i) => ({
        signer_id: `s-${i}`,
        email: `s${i}@example.com`,
      })),
      documents: Array.from({ length: n }, (_, i) => ({ id: `d-${i}`, document_name: `D${i}` })),
      // Each record yields one `meeting_start` event; with `created` that
      // is n events when there are n - 1 records.
      notarization_records: Array.from({ length: Math.max(n - 1, 0) }, (_, i) => ({
        id: `nr-${i}`,
        meeting_start: at(i + 1),
      })),
    } as never
  })
}

type ChildLister = (c: Credentials, p: QueryParams) => Promise<Array<{ id: string }>>
const CHILD: Array<[string, ChildLister, (i: number) => string]> = [
  ['listSigners', (c, p) => adapter.listSigners(c, TX, p), (i) => `${TX}:s-${i}`],
  ['listDocuments', (c, p) => adapter.listDocuments(c, TX, p), (i) => `${TX}:d-${i}`],
  ['listAuditTrailEntries', (c, p) => adapter.listAuditTrailEntries(c, TX, p), (i) => `${TX}:${i}`],
]

describe.each(CHILD)('ProofAdapter.%s pages GET /transactions/{id} locally', (_n, list, id) => {
  const L = 2
  const N = 2 * L + 1
  const ids = (n: number) => Array.from({ length: n }, (_, i) => id(i))

  it('with N = 2L+1 rows, pages 1..3 return every id once with an exact hasMore', async () => {
    const get = mockTransaction(N)
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
    // The endpoint has no paging parameter: nothing but the path goes up.
    for (const c of get.mock.calls) expect(c).toEqual([`/transactions/${TX}`])
  })

  it('page 2 is not page 1', async () => {
    mockTransaction(N)
    const p1 = await list(CREDS, withPageSink({ page: 1, limit: L }))
    const p2 = await list(CREDS, withPageSink({ page: 2, limit: L }))
    expect(p1.map((r) => r.id)).toEqual(ids(2))
    expect(p2.map((r) => r.id)).toEqual([id(2), id(3)])
  })

  it('a large limit returns the whole list and ends', async () => {
    mockTransaction(N)
    const params = withPageSink({ page: 1, limit: 1000 })
    expect((await list(CREDS, params)).map((r) => r.id)).toEqual(ids(N))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('without a limit returns every row', async () => {
    mockTransaction(N)
    expect(await list(CREDS, {})).toHaveLength(N)
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    mockTransaction(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const rows = await list(CREDS, params)
    const env = listPage(rows, params, 'proof')
    expect(env.data.map((r) => r.id)).toEqual([id(2), id(3)])
    expect(env.meta.page).toBe(2)
    expect(env.meta.totalCount).toBe(N)
    expect(env.meta.hasMore).toBe(true)
  })
})

describe('ProofAdapter child getters still see the whole list', () => {
  it('getAuditTrailEntry finds an entry past the first page', async () => {
    mockTransaction(5)
    const e = await adapter.getAuditTrailEntry(CREDS, `${TX}:4`)
    expect(e.id).toBe(`${TX}:4`)
  })

  it('getDocument finds the last document', async () => {
    mockTransaction(5)
    const d = await adapter.getDocument(CREDS, `${TX}:d-4`)
    expect(d.id).toBe(`${TX}:d-4`)
  })

  it('listDocuments page 2 keeps each index from the whole documents array', async () => {
    mockTransaction(5)
    const p2 = await adapter.listDocuments(CREDS, TX, withPageSink({ page: 2, limit: 2 }))
    // No bundle_position in the mock, so `order` is the index in documents[].
    expect(p2.map((d) => d.order)).toEqual([2, 3])
  })

  it('getSigner finds the last signer', async () => {
    mockTransaction(5)
    const s = await adapter.getSigner(CREDS, `${TX}:s-4`)
    expect(s.id).toBe(`${TX}:s-4`)
  })
})

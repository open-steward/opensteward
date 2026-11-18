import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { BoldsignClient } from '../../../../../../src/verticals/docsign/adapters/boldsign/client'
import { BoldsignAdapter } from '../../../../../../src/verticals/docsign/adapters/boldsign'

/**
 * Signers, documents and audit-trail entries all come from
 * `GET /v1/document/properties`, whose only query parameter is `documentId`
 * (https://developers.boldsign.com/documents/document-details-and-status/).
 * The reply carries the document's whole `signerDetails[]`, `files[]` and
 * `documentHistory[]` arrays, so there is no upstream page to ask for: the
 * adapter must page the collection itself, or page 2 repeats page 1.
 */

const CREDS = { accessToken: 'key' } as Credentials
const DOC_ID = 'doc-1'
const L = 2
const N = 2 * L + 1

function fakeProperties(n: number) {
  return {
    documentId: DOC_ID,
    signerDetails: Array.from({ length: n }, (_, i) => ({
      signerName: `Signer ${i}`,
      signerEmail: `s${i}@example.com`,
      order: i + 1,
      status: 'NotCompleted',
    })),
    files: Array.from({ length: n }, (_, i) => ({ documentName: `file-${i}.pdf`, pageCount: 1 })),
    documentHistory: Array.from({ length: n }, (_, i) => ({
      name: `Actor ${i}`,
      email: `a${i}@example.com`,
      action: 'Viewed',
      timestamp: 1_700_000_000 + i,
    })),
  }
}

/** Honours only the documented `documentId` parameter; ignores anything else. */
function mockProperties(n: number) {
  return vi
    .spyOn(BoldsignClient.prototype, 'get')
    .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      if (path !== '/v1/document/properties') throw new Error(`unexpected path ${path}`)
      if (params?.['documentId'] !== DOC_ID) throw new Error('unknown documentId')
      return fakeProperties(n) as never
    })
}

afterEach(() => vi.restoreAllMocks())

const adapter = new BoldsignAdapter({ clientId: '', clientSecret: '', redirectUri: '' })

type Lister = (c: Credentials, id: string, p: QueryParams) => Promise<Array<{ id: string }>>
const METHODS: Array<[string, Lister, string[]]> = [
  [
    'listSigners',
    (c, id, p) => adapter.listSigners(c, id, p),
    Array.from({ length: N }, (_, i) => `${DOC_ID}:s${i}@example.com`),
  ],
  [
    'listDocuments',
    (c, id, p) => adapter.listDocuments(c, id, p),
    Array.from({ length: N }, (_, i) => `${DOC_ID}:${i}`),
  ],
  [
    'listAuditTrailEntries',
    (c, id, p) => adapter.listAuditTrailEntries(c, id, p),
    Array.from({ length: N }, (_, i) => `${DOC_ID}:${i}`),
  ],
]

describe.each(METHODS)(
  'BoldsignAdapter.%s pages the whole document locally',
  (_name, list, ids) => {
    it('pages 1..3 return every id once, in order, with an exact hasMore', async () => {
      const get = mockProperties(N)
      const seen: string[] = []
      const more: Array<boolean | undefined> = []
      for (const page of [1, 2, 3]) {
        const params = withPageSink({ page, limit: L })
        const rows = await list(CREDS, DOC_ID, params)
        seen.push(...rows.map((r) => r.id))
        more.push(readUpstreamPage(params)?.hasMore)
        expect(readUpstreamPage(params)?.totalCount).toBe(N)
        expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
      }
      expect(seen).toEqual(ids)
      expect(more).toEqual([true, true, false])
      // The endpoint takes no paging parameter; every page sends only the id.
      for (const call of get.mock.calls) {
        expect(call).toEqual(['/v1/document/properties', { documentId: DOC_ID }])
      }
    })

    it('page 2 is not page 1', async () => {
      mockProperties(N)
      const p1 = await list(CREDS, DOC_ID, withPageSink({ page: 1, limit: L }))
      const p2 = await list(CREDS, DOC_ID, withPageSink({ page: 2, limit: L }))
      expect(p2.map((r) => r.id)).toEqual(ids.slice(L, 2 * L))
      expect(p2.map((r) => r.id)).not.toEqual(p1.map((r) => r.id))
    })

    it('without a limit returns the whole collection (used by the get* lookups)', async () => {
      mockProperties(N)
      const rows = await list(CREDS, DOC_ID, {})
      expect(rows.map((r) => r.id)).toEqual(ids)
    })

    it('serves page 2 on the API path through parseListQuery and listPage', async () => {
      mockProperties(N)
      const params = parseListQuery({ page: '2', limit: String(L) })
      const rows = await list(CREDS, DOC_ID, params)
      const env = listPage(rows, params, 'boldsign')
      expect(env.data.map((r) => r.id)).toEqual(ids.slice(L, 2 * L))
      expect(env.meta.page).toBe(2)
      expect(env.meta.limit).toBe(L)
      expect(env.meta.totalCount).toBe(N)
      expect(env.meta.hasMore).toBe(true)
    })
  },
)

describe('BoldsignAdapter get* lookups still see every row', () => {
  it('getDocument and getAuditTrailEntry resolve the last index', async () => {
    mockProperties(N)
    expect((await adapter.getDocument(CREDS, `${DOC_ID}:${N - 1}`)).id).toBe(`${DOC_ID}:${N - 1}`)
    expect((await adapter.getAuditTrailEntry(CREDS, `${DOC_ID}:${N - 1}`)).id).toBe(
      `${DOC_ID}:${N - 1}`,
    )
  })

  it('getSigner resolves the last signer', async () => {
    mockProperties(N)
    const all = await adapter.listSigners(CREDS, DOC_ID, {})
    const last = all[N - 1]
    expect(last?.email).toBe(`s${N - 1}@example.com`)
    const found = await adapter.getSigner(CREDS, last!.externalId)
    expect(found.email).toBe(`s${N - 1}@example.com`)
  })
})

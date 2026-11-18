import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { EversignClient } from '../../../../../../src/verticals/docsign/adapters/eversign/client'
import { EversignAdapter } from '../../../../../../src/verticals/docsign/adapters/eversign'

/**
 * Signers and files both come from Get Document,
 * `GET /document?document_hash=…`, which "will return the entire
 * document/template data set" and takes no paging parameter
 * (https://eversign.com/api/documentation/methods). There is no upstream page
 * to ask for, so the adapter must page the `signers` and `files` arrays
 * itself, or page 2 repeats page 1.
 */

const CREDS = { accessToken: 'tok' } as Credentials
const HASH = 'docHash1'
const L = 2
const N = 2 * L + 1

function fakeDocument(n: number) {
  const signers = Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `Signer ${i}`,
    email: `s${i}@example.com`,
    order: i + 1,
  }))
  const files = Array.from({ length: n }, (_, i) => ({
    name: `File ${i}`,
    file_id: `F${i}`,
    pages: 1,
  }))
  return { document_hash: HASH, title: 'Doc', signers, files }
}

/** Honours only the documented Get Document call: path plus `document_hash`. */
function mockGetDocument(n: number) {
  return vi
    .spyOn(EversignClient.prototype, 'get')
    .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      if (path !== '/document') throw new Error(`unexpected path ${path}`)
      if (JSON.stringify(params) !== JSON.stringify({ document_hash: HASH })) {
        throw new Error(`Get Document takes no paging params: ${JSON.stringify(params)}`)
      }
      return fakeDocument(n) as never
    })
}

afterEach(() => vi.restoreAllMocks())

const adapter = new EversignAdapter({ clientId: '', clientSecret: '', redirectUri: '' })

type Lister = (c: Credentials, id: string, p: QueryParams) => Promise<Array<{ id: string }>>
const signerIds = (n: number) => Array.from({ length: n }, (_, i) => `${HASH}:${i + 1}`)
const fileIds = (n: number) => Array.from({ length: n }, (_, i) => `${HASH}:F${i}`)
const METHODS: Array<[string, Lister, (n: number) => string[]]> = [
  ['listSigners', (c, id, p) => adapter.listSigners(c, id, p), signerIds],
  ['listDocuments', (c, id, p) => adapter.listDocuments(c, id, p), fileIds],
]

describe.each(METHODS)(
  'EversignAdapter.%s pages the whole document locally',
  (_name, list, idsOf) => {
    const ids = idsOf(N)

    it('pages 1..3 return every id once, in order, with an exact hasMore', async () => {
      const get = mockGetDocument(N)
      const seen: string[] = []
      const more: Array<boolean | undefined> = []
      for (const page of [1, 2, 3]) {
        const params = withPageSink({ page, limit: L })
        const rows = await list(CREDS, HASH, params)
        seen.push(...rows.map((r) => r.id))
        more.push(readUpstreamPage(params)?.hasMore)
        expect(readUpstreamPage(params)?.totalCount).toBe(N)
        expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
      }
      expect(seen).toEqual(ids)
      expect(more).toEqual([true, true, false])
      // The endpoint takes no paging parameter; every page asks for the document.
      for (const call of get.mock.calls)
        expect(call).toEqual(['/document', { document_hash: HASH }])
    })

    it('page 2 is not page 1', async () => {
      mockGetDocument(N)
      const p1 = await list(CREDS, HASH, withPageSink({ page: 1, limit: L }))
      const p2 = await list(CREDS, HASH, withPageSink({ page: 2, limit: L }))
      expect(p2.map((r) => r.id)).toEqual(ids.slice(L, 2 * L))
      expect(p2.map((r) => r.id)).not.toEqual(p1.map((r) => r.id))
    })

    it('a limit above the collection size serves everything once, with no next page', async () => {
      mockGetDocument(N)
      const params = parseListQuery({ page: '1', limit: '100000' })
      const rows = await list(CREDS, HASH, params)
      expect(rows.map((r) => r.id)).toEqual(ids)
      expect(readUpstreamPage(params)?.hasMore).toBe(false)
    })

    it('without a limit returns the whole collection (used by the get* lookups)', async () => {
      mockGetDocument(N)
      const rows = await list(CREDS, HASH, {})
      expect(rows.map((r) => r.id)).toEqual(ids)
    })

    it('pages a document larger than any plausible cap: the last page ends it', async () => {
      const BIG = 1001
      mockGetDocument(BIG)
      const size = 250
      const last = Math.ceil(BIG / size)
      const params = withPageSink({ page: last, limit: size })
      const rows = await list(CREDS, HASH, params)
      expect(rows.map((r) => r.id)).toEqual(idsOf(BIG).slice((last - 1) * size))
      expect(readUpstreamPage(params)?.totalCount).toBe(BIG)
      expect(readUpstreamPage(params)?.hasMore).toBe(false)
      expect(await list(CREDS, HASH, {})).toHaveLength(BIG)
    })

    it('serves page 2 on the API path through parseListQuery and listPage', async () => {
      mockGetDocument(N)
      const params = parseListQuery({ page: '2', limit: String(L) })
      const rows = await list(CREDS, HASH, params)
      const env = listPage(rows, params, 'eversign')
      expect(env.data.map((r) => r.id)).toEqual(ids.slice(L, 2 * L))
      expect(env.meta.page).toBe(2)
      expect(env.meta.limit).toBe(L)
      expect(env.meta.totalCount).toBe(N)
      expect(env.meta.hasMore).toBe(true)
    })
  },
)

describe('EversignAdapter get* lookups still see the whole document', () => {
  it('getSigner finds the last signer and getDocument the last file', async () => {
    mockGetDocument(N)
    const s = await adapter.getSigner(CREDS, `${HASH}:${N}`)
    expect(s.id).toBe(`${HASH}:${N}`)
    const d = await adapter.getDocument(CREDS, `${HASH}:F${N - 1}`)
    expect(d.id).toBe(`${HASH}:F${N - 1}`)
  })
})

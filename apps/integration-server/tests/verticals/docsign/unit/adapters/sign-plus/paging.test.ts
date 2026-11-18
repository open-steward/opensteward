import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { SignPlusClient } from '../../../../../../src/verticals/docsign/adapters/sign-plus/client'
import { SignPlusAdapter } from '../../../../../../src/verticals/docsign/adapters/sign-plus'

/**
 * Signers come from `GET /envelope/{envelope_id}` (recipients nested in
 * `signing_steps[]`) and documents from `GET /envelope/{envelope_id}/documents`.
 * Both endpoints take only the `envelope_id` path parameter and return the
 * whole array (https://apidoc.sign.plus/api-reference/endpoints/signplus/get-envelope.md,
 * https://apidoc.sign.plus/api-reference/endpoints/signplus/get-envelope-documents.md).
 * There is no upstream page to ask for, so the adapter must page the
 * collection itself, or page 2 repeats page 1.
 */

const CREDS = { accessToken: 'tok' } as Credentials
const ENV = 'env-1'
const L = 2
const N = 2 * L + 1

function fakeEnvelope(n: number) {
  // Spread recipients across two signing steps so flattening order matters.
  const recipients = Array.from({ length: n }, (_, i) => ({
    id: `rcp-${i}`,
    name: `Signer ${i}`,
    email: `s${i}@example.com`,
    role: 'SIGNER',
  }))
  const cut = Math.ceil(n / 2)
  return {
    id: ENV,
    status: 'IN_PROGRESS',
    signing_steps: [
      { recipients: recipients.slice(0, cut) },
      { recipients: recipients.slice(cut) },
    ],
  }
}

function fakeDocuments(n: number) {
  return {
    documents: Array.from({ length: n }, (_, i) => ({
      id: `doc-${i}`,
      name: `Doc ${i}`,
      filename: `doc-${i}.pdf`,
      page_count: 1,
    })),
  }
}

/** Honours only the documented path; any query parameter is a bug here. */
function mockGet(n: number) {
  return vi
    .spyOn(SignPlusClient.prototype, 'get')
    .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      if (params !== undefined) throw new Error('these endpoints take no paging params')
      if (path === `/envelope/${ENV}`) return fakeEnvelope(n) as never
      if (path === `/envelope/${ENV}/documents`) return fakeDocuments(n) as never
      const single = fakeDocuments(n).documents.find(
        (d) => path === `/envelope/${ENV}/document/${d.id}`,
      )
      if (single) return single as never
      throw new Error(`unexpected path ${path}`)
    })
}

afterEach(() => vi.restoreAllMocks())

const adapter = new SignPlusAdapter()

type Lister = (c: Credentials, id: string, p: QueryParams) => Promise<Array<{ id: string }>>
const idsOf = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}-${i}`)
const METHODS: Array<[string, Lister, string, string]> = [
  ['listSigners', (c, id, p) => adapter.listSigners(c, id, p), 'rcp', `/envelope/${ENV}`],
  [
    'listDocuments',
    (c, id, p) => adapter.listDocuments(c, id, p),
    'doc',
    `/envelope/${ENV}/documents`,
  ],
]

describe.each(METHODS)(
  'SignPlusAdapter.%s pages the whole envelope locally',
  (_name, list, prefix, path) => {
    const ids = idsOf(prefix, N)

    it('pages 1..3 return every id once, in order, with an exact hasMore', async () => {
      const get = mockGet(N)
      const seen: string[] = []
      const more: Array<boolean | undefined> = []
      for (const page of [1, 2, 3]) {
        const params = withPageSink({ page, limit: L })
        const rows = await list(CREDS, ENV, params)
        seen.push(...rows.map((r) => r.id))
        more.push(readUpstreamPage(params)?.hasMore)
        expect(readUpstreamPage(params)?.totalCount).toBe(N)
        expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
      }
      expect(seen).toEqual(ids)
      expect(more).toEqual([true, true, false])
      // The endpoint takes no paging parameter; every page asks for the whole collection.
      for (const call of get.mock.calls) expect(call).toEqual([path])
    })

    it('page 2 is not page 1', async () => {
      mockGet(N)
      const p1 = await list(CREDS, ENV, withPageSink({ page: 1, limit: L }))
      const p2 = await list(CREDS, ENV, withPageSink({ page: 2, limit: L }))
      expect(p2.map((r) => r.id)).toEqual(ids.slice(L, 2 * L))
      expect(p2.map((r) => r.id)).not.toEqual(p1.map((r) => r.id))
    })

    it('a limit above the collection size serves everything once, with no next page', async () => {
      mockGet(N)
      const params = parseListQuery({ page: '1', limit: '100000' })
      const rows = await list(CREDS, ENV, params)
      expect(rows.map((r) => r.id)).toEqual(ids)
      expect(readUpstreamPage(params)?.hasMore).toBe(false)
    })

    it('without a limit returns the whole collection (used by the get* lookups)', async () => {
      mockGet(N)
      const rows = await list(CREDS, ENV, {})
      expect(rows.map((r) => r.id)).toEqual(ids)
    })

    it('serves page 2 on the API path through parseListQuery and listPage', async () => {
      mockGet(N)
      const params = parseListQuery({ page: '2', limit: String(L) })
      const rows = await list(CREDS, ENV, params)
      const env = listPage(rows, params, 'sign-plus')
      expect(env.data.map((r) => r.id)).toEqual(ids.slice(L, 2 * L))
      expect(env.meta.page).toBe(2)
      expect(env.meta.limit).toBe(L)
      expect(env.meta.totalCount).toBe(N)
      expect(env.meta.hasMore).toBe(true)
    })
  },
)

describe('SignPlusAdapter get* lookups still see the whole envelope', () => {
  it('getSigner finds the last recipient', async () => {
    mockGet(N)
    const s = await adapter.getSigner(CREDS, `${ENV}:rcp-${N - 1}`)
    expect(s.externalId).toBe(`rcp-${N - 1}`)
  })

  it('getDocument resolves the order of the last document from the whole manifest', async () => {
    mockGet(N)
    const d = await adapter.getDocument(CREDS, `${ENV}:doc-${N - 1}`)
    expect(d.externalId).toBe(`doc-${N - 1}`)
    expect(d.order).toBe(N - 1)
  })

  it('listDocuments keeps the manifest order of the last document on a later page', async () => {
    mockGet(N)
    const rows = await adapter.listDocuments(CREDS, ENV, withPageSink({ page: 3, limit: L }))
    expect(rows.map((r) => r.id)).toEqual([`doc-${N - 1}`])
    expect(rows[0]?.order).toBe(N - 1)
  })
})

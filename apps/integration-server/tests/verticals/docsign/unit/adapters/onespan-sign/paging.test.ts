import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { OneSpanSignClient } from '../../../../../../src/verticals/docsign/adapters/onespan-sign/client'
import { OneSpanSignAdapter } from '../../../../../../src/verticals/docsign/adapters/onespan-sign'

/**
 * Signers and documents both come from `GET /api/packages/{packageId}`, which
 * takes no paging parameter and returns the whole package JSON: its `roles`
 * (each carrying `signers`) and its `documents`
 * (https://docs.onespan.com/docs/retrieving-reasons-for-declining). There is no
 * upstream page to ask for, so the adapter must page the collection itself, or
 * page 2 repeats page 1.
 */

const CREDS = { accessToken: 'tok' } as Credentials
const PKG = 'pkg-1'
const L = 2
const N = 2 * L + 1

/** Signers spread over roles (the first role holds two) so flattening is exercised. */
function fakePackage(n: number) {
  const roles: Array<{ id: string; type: string; index: number; signers: unknown[] }> = []
  for (let i = 0; i < n; i++) {
    const signer = { id: `sig-${i}`, email: `s${i}@example.com`, firstName: 'S', lastName: `${i}` }
    if (i === 1) roles[0]!.signers.push(signer)
    else roles.push({ id: `role-${i}`, type: 'SIGNER', index: roles.length, signers: [signer] })
  }
  const documents = Array.from({ length: n }, (_, i) => ({ id: `doc-${i}`, name: `Doc ${i}` }))
  return { id: PKG, status: 'SENT', roles, documents }
}

/** Honours only the documented path; any query parameter is a bug here. */
function mockGetPackage(n: number) {
  return vi
    .spyOn(OneSpanSignClient.prototype, 'get')
    .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      if (path !== `/packages/${PKG}`) throw new Error(`unexpected path ${path}`)
      if (params !== undefined) throw new Error('GET /packages/{packageId} takes no paging params')
      return fakePackage(n) as never
    })
}

afterEach(() => vi.restoreAllMocks())

const adapter = new OneSpanSignAdapter({ clientId: '', clientSecret: '', redirectUri: '' })

const signerIds = (n: number) => Array.from({ length: n }, (_, i) => `${PKG}:sig-${i}`)
const documentIds = (n: number) => Array.from({ length: n }, (_, i) => `${PKG}:doc-${i}`)

type Lister = (c: Credentials, id: string, p: QueryParams) => Promise<Array<{ id: string }>>
const METHODS: Array<[string, Lister, (n: number) => string[]]> = [
  ['listSigners', (c, id, p) => adapter.listSigners(c, id, p), signerIds],
  ['listDocuments', (c, id, p) => adapter.listDocuments(c, id, p), documentIds],
]

describe.each(METHODS)(
  'OneSpanSignAdapter.%s pages the whole package locally',
  (_name, list, idsOf) => {
    const ids = idsOf(N)

    it('pages 1..3 return every id once, in order, with an exact hasMore', async () => {
      const get = mockGetPackage(N)
      const seen: string[] = []
      const more: Array<boolean | undefined> = []
      for (const page of [1, 2, 3]) {
        const params = withPageSink({ page, limit: L })
        const rows = await list(CREDS, PKG, params)
        seen.push(...rows.map((r) => r.id))
        more.push(readUpstreamPage(params)?.hasMore)
        expect(readUpstreamPage(params)?.totalCount).toBe(N)
        expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
      }
      expect(seen).toEqual(ids)
      expect(more).toEqual([true, true, false])
      // The endpoint takes no paging parameter; every page asks for the package.
      for (const call of get.mock.calls) expect(call).toEqual([`/packages/${PKG}`])
    })

    it('page 2 is not page 1', async () => {
      mockGetPackage(N)
      const p1 = await list(CREDS, PKG, withPageSink({ page: 1, limit: L }))
      const p2 = await list(CREDS, PKG, withPageSink({ page: 2, limit: L }))
      expect(p2.map((r) => r.id)).toEqual(ids.slice(L, 2 * L))
      expect(p2.map((r) => r.id)).not.toEqual(p1.map((r) => r.id))
    })

    it('a limit above the collection size serves everything once, with no next page', async () => {
      mockGetPackage(N)
      const params = parseListQuery({ page: '1', limit: '100000' })
      const rows = await list(CREDS, PKG, params)
      expect(rows.map((r) => r.id)).toEqual(ids)
      expect(readUpstreamPage(params)?.hasMore).toBe(false)
    })

    it('without a limit returns the whole collection (used by the get* lookups)', async () => {
      mockGetPackage(N)
      const rows = await list(CREDS, PKG, {})
      expect(rows.map((r) => r.id)).toEqual(ids)
    })

    it('pages a package larger than any plausible cap: the last page ends it', async () => {
      const BIG = 1001
      mockGetPackage(BIG)
      const size = 250
      const last = Math.ceil(BIG / size)
      const params = withPageSink({ page: last, limit: size })
      const rows = await list(CREDS, PKG, params)
      expect(rows.map((r) => r.id)).toEqual(idsOf(BIG).slice((last - 1) * size))
      expect(readUpstreamPage(params)?.totalCount).toBe(BIG)
      expect(readUpstreamPage(params)?.hasMore).toBe(false)
    })

    it('serves page 2 on the API path through parseListQuery and listPage', async () => {
      mockGetPackage(N)
      const params = parseListQuery({ page: '2', limit: String(L) })
      const rows = await list(CREDS, PKG, params)
      const env = listPage(rows, params, 'onespan-sign')
      expect(env.data.map((r) => r.id)).toEqual(ids.slice(L, 2 * L))
      expect(env.meta.page).toBe(2)
      expect(env.meta.limit).toBe(L)
      expect(env.meta.totalCount).toBe(N)
      expect(env.meta.hasMore).toBe(true)
    })
  },
)

describe('OneSpanSignAdapter.listDocuments keeps absolute positions across pages', () => {
  it('a document with no id or index on page 2 keeps its absolute order and fallback id', async () => {
    vi.spyOn(OneSpanSignClient.prototype, 'get').mockImplementation(async (path: string) => {
      if (path !== `/packages/${PKG}`) throw new Error(`unexpected path ${path}`)
      const documents = Array.from({ length: N }, (_, i) => ({ name: `Doc ${i}` }))
      return { id: PKG, status: 'SENT', roles: [], documents } as never
    })
    const rows = await adapter.listDocuments(CREDS, PKG, withPageSink({ page: 2, limit: L }))
    expect(rows.map((d) => d.order)).toEqual([L, L + 1])
    expect(rows.map((d) => d.externalId)).toEqual([`${PKG}:${L}`, `${PKG}:${L + 1}`])
  })
})

describe('OneSpanSignAdapter get* lookups still see the whole package', () => {
  it('finds the last row of a package larger than any plausible page cap', async () => {
    const BIG = 1001
    mockGetPackage(BIG)
    const s = await adapter.getSigner(CREDS, `${PKG}:sig-${BIG - 1}`)
    expect(s.externalId).toBe(`sig-${BIG - 1}`)
    const d = await adapter.getDocument(CREDS, `${PKG}:doc-${BIG - 1}`)
    expect(d.externalId).toBe(`doc-${BIG - 1}`)
  })

  it('getSigner finds the last signer and getDocument the last document', async () => {
    mockGetPackage(N)
    const s = await adapter.getSigner(CREDS, `${PKG}:sig-${N - 1}`)
    expect(s.externalId).toBe(`sig-${N - 1}`)
    const d = await adapter.getDocument(CREDS, `${PKG}:doc-${N - 1}`)
    expect(d.externalId).toBe(`doc-${N - 1}`)
  })
})

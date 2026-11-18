import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { PenneoClient } from '../../../../../../src/verticals/docsign/adapters/penneo/client'
import { PenneoAdapter } from '../../../../../../src/verticals/docsign/adapters/penneo'

/**
 * `GET /casefiles/{caseFileId}/signers` ("List all signers that linked to the
 * case file.") and `GET /casefiles/{caseFileId}/documents` ("List all
 * documents that are linked to the case file.") take only `version` and
 * `caseFileId` (https://app.penneo.com/api/docs/swagger.json). There is no
 * upstream page to ask for, so the adapter must page the collection itself,
 * or page 2 repeats page 1.
 */

const CREDS = { accessToken: 'tok' } as Credentials
const CASEFILE = '42'
const L = 2
const N = 2 * L + 1

function rows(kind: 'signers' | 'documents', n: number) {
  return Array.from({ length: n }, (_, i) =>
    kind === 'signers'
      ? { id: 100 + i, name: `Signer ${i}`, email: `s${i}@example.com` }
      : { id: 200 + i, title: `Doc ${i}` },
  )
}

/** Honours only the documented path; any query parameter is a bug here. */
function mockGet(kind: 'signers' | 'documents', n: number) {
  return vi
    .spyOn(PenneoClient.prototype, 'get')
    .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      if (path !== `/casefiles/${CASEFILE}/${kind}`) throw new Error(`unexpected path ${path}`)
      if (params !== undefined) throw new Error(`${kind} list takes no paging params`)
      return rows(kind, n) as never
    })
}

afterEach(() => vi.restoreAllMocks())

const adapter = new PenneoAdapter({ clientId: '', clientSecret: '', redirectUri: '' })

type Lister = (c: Credentials, id: string, p: QueryParams) => Promise<Array<{ id: string }>>
const METHODS: Array<[string, 'signers' | 'documents', Lister, (n: number) => string[]]> = [
  [
    'listSigners',
    'signers',
    (c, id, p) => adapter.listSigners(c, id, p),
    (n) => Array.from({ length: n }, (_, i) => String(100 + i)),
  ],
  [
    'listDocuments',
    'documents',
    (c, id, p) => adapter.listDocuments(c, id, p),
    (n) => Array.from({ length: n }, (_, i) => String(200 + i)),
  ],
]

describe.each(METHODS)(
  'PenneoAdapter.%s pages the whole casefile locally',
  (_name, kind, list, idsFor) => {
    const ids = idsFor(N)

    it('pages 1..3 return every id once, in order, with an exact hasMore', async () => {
      const get = mockGet(kind, N)
      const seen: string[] = []
      const more: Array<boolean | undefined> = []
      for (const page of [1, 2, 3]) {
        const params = withPageSink({ page, limit: L })
        const got = await list(CREDS, CASEFILE, params)
        seen.push(...got.map((r) => r.id))
        more.push(readUpstreamPage(params)?.hasMore)
        expect(readUpstreamPage(params)?.totalCount).toBe(N)
        expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
      }
      expect(seen).toEqual(ids)
      expect(more).toEqual([true, true, false])
      // The endpoint takes no paging parameter: the page-2 request is the same path, bare.
      for (const call of get.mock.calls) expect(call).toEqual([`/casefiles/${CASEFILE}/${kind}`])
    })

    it('page 2 is not page 1', async () => {
      mockGet(kind, N)
      const p1 = await list(CREDS, CASEFILE, withPageSink({ page: 1, limit: L }))
      const p2 = await list(CREDS, CASEFILE, withPageSink({ page: 2, limit: L }))
      expect(p2.map((r) => r.id)).toEqual(ids.slice(L, 2 * L))
      expect(p2.map((r) => r.id)).not.toEqual(p1.map((r) => r.id))
    })

    it('a limit above any maximum serves everything once, with no next page', async () => {
      mockGet(kind, N)
      const params = parseListQuery({ page: '1', limit: '100000' })
      const got = await list(CREDS, CASEFILE, params)
      expect(got.map((r) => r.id)).toEqual(ids)
      expect(readUpstreamPage(params)?.hasMore).toBe(false)
    })

    it('without a limit returns the whole collection', async () => {
      mockGet(kind, N)
      const got = await list(CREDS, CASEFILE, {})
      expect(got.map((r) => r.id)).toEqual(ids)
    })

    it('pages a casefile larger than any plausible cap: the last page ends it', async () => {
      const BIG = 1001
      mockGet(kind, BIG)
      const size = 250
      const last = Math.ceil(BIG / size)
      const params = withPageSink({ page: last, limit: size })
      const got = await list(CREDS, CASEFILE, params)
      expect(got.map((r) => r.id)).toEqual(idsFor(BIG).slice((last - 1) * size))
      expect(readUpstreamPage(params)?.totalCount).toBe(BIG)
      expect(readUpstreamPage(params)?.hasMore).toBe(false)
    })

    it('serves page 2 on the API path through parseListQuery and listPage', async () => {
      mockGet(kind, N)
      const params = parseListQuery({ page: '2', limit: String(L) })
      const got = await list(CREDS, CASEFILE, params)
      const env = listPage(got, params, 'penneo')
      expect(env.data.map((r) => r.id)).toEqual(ids.slice(L, 2 * L))
      expect(env.meta.page).toBe(2)
      expect(env.meta.limit).toBe(L)
      expect(env.meta.totalCount).toBe(N)
      expect(env.meta.hasMore).toBe(true)
    })
  },
)

describe('PenneoAdapter.listDocuments keeps casefile-wide order across pages', () => {
  it('page 2 carries order L, L+1 and the document-${order} name fallback', async () => {
    vi.spyOn(PenneoClient.prototype, 'get').mockImplementation(async (path: string) => {
      if (path !== `/casefiles/${CASEFILE}/documents`) throw new Error(`unexpected path ${path}`)
      // No titles, so the name falls back to `document-${order}`.
      return Array.from({ length: N }, (_, i) => ({ id: 200 + i })) as never
    })
    const got = await adapter.listDocuments(CREDS, CASEFILE, withPageSink({ page: 2, limit: L }))
    expect(got.map((d) => d.order)).toEqual([L, L + 1])
    expect(got.map((d) => d.name)).toEqual([`document-${L}`, `document-${L + 1}`])
  })
})

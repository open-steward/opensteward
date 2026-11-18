/**
 * Paging for CloudSign's list methods.
 *
 * `GET /documents` pages by `page` alone, at up to 100 rows a page, with no
 * size parameter; a page past the end returns an empty `documents` array
 * (https://api.swaggerhub.com/apis/CloudSign/cloudsign-web_api/0.37.0, the
 * `page` query parameter: "ページ番号は 1 から始まる / 1 ページあたり最大
 * 100 件のデータを取得 / … 一覧のデータ量に対して大きすぎる値を指定した場合は
 * 返却モデル：`documentListModel` の documents の配列は空となる"). The
 * adapter used to send an undocumented `limit` and ignore `page`, so page 2
 * repeated page 1.
 *
 * `GET /documents/{documentID}` takes only the path id and returns the whole
 * documentModel, participants[] included, so signers and documents are paged
 * locally.
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
import { CloudSignClient } from '../../../../../../src/verticals/docsign/adapters/cloudsign/client'
import { CloudSignAdapter } from '../../../../../../src/verticals/docsign/adapters/cloudsign'

const CREDS = { accessToken: 'tok', refreshToken: 'rt' } as Credentials
const UPSTREAM = 100
const adapter = new CloudSignAdapter({ clientId: 'c', clientSecret: 's', redirectUri: 'r' })

beforeEach(() => _resetRowPager())
afterEach(() => vi.restoreAllMocks())

/**
 * A fake `GET /documents` holding `n` documents of the given status. It
 * honours ONLY the documented `page` (1-based, 100 a page, default 1) and
 * `status` parameters; any other query key is ignored.
 */
function mockDocuments(n: number, status = -1) {
  const all = Array.from({ length: n }, (_, i) => ({
    id: `doc-${i}`,
    title: `Doc ${i}`,
    status: status === -1 ? 1 : status,
    participants: [],
    files: [],
  }))
  return vi
    .spyOn(CloudSignClient.prototype, 'get')
    .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      if (path !== '/documents') throw new Error(`unexpected path ${path}`)
      const asked = Number(params?.['page'])
      const page = Number.isInteger(asked) && asked >= 1 ? asked : 1
      const wanted = params?.['status'] === undefined ? -1 : Number(params['status'])
      const rows = all.filter((d) => wanted === -1 || d.status === wanted)
      return {
        total: rows.length,
        page,
        documents: rows.slice((page - 1) * UPSTREAM, page * UPSTREAM),
      } as never
    })
}

type TopLister = (c: Credentials, p: QueryParams) => Promise<Array<{ id: string }>>
const TOP: Array<[string, TopLister, number]> = [
  ['listEnvelopes', (c, p) => adapter.listEnvelopes(c, p), -1],
  ['listTemplates', (c, p) => adapter.listTemplates(c, p), 4],
]

describe.each(TOP)('CloudSignAdapter.%s pages GET /documents by page', (_name, list, status) => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `doc-${i}`)

  it('with N = 2L+1 small rows, pages 1..3 return every id once with an exact hasMore', async () => {
    const L = 2
    const N = 2 * L + 1
    mockDocuments(N, status)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await list(CREDS, params)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids(N))
    expect(more).toEqual([true, true, false])
  })

  it('with L = 100 and N = 201, pages 1..3 cross upstream pages and page 2 sends page=2', async () => {
    const L = UPSTREAM
    const N = 2 * L + 1
    const get = mockDocuments(N, status)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await list(CREDS, params)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids(N))
    expect(more).toEqual([true, true, false])
    const sent = get.mock.calls.map((c) => c[1] as Record<string, unknown>)
    expect(sent.map((p) => p['page'])).toEqual([1, 2, 3])
    for (const p of sent) {
      // Only documented keys go upstream: no `limit`, no `cursor`.
      expect(Object.keys(p).sort()).toEqual(status === -1 ? ['page'] : ['page', 'status'])
      if (status !== -1) expect(p['status']).toBe(status)
    }
  })

  it('page 2 is not page 1', async () => {
    mockDocuments(5, status)
    const p1 = await list(CREDS, withPageSink({ page: 1, limit: 2 }))
    const p2 = await list(CREDS, withPageSink({ page: 2, limit: 2 }))
    expect(p1.map((r) => r.id)).toEqual(['doc-0', 'doc-1'])
    expect(p2.map((r) => r.id)).toEqual(['doc-2', 'doc-3'])
  })

  it('a limit above the upstream page maximum still returns exactly that many rows', async () => {
    const get = mockDocuments(260, status)
    const params = withPageSink({ page: 1, limit: 250 })
    const rows = await list(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(ids(250))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    for (const c of get.mock.calls) expect(c[1]).not.toHaveProperty('limit')
  })

  it('an empty list ends at once', async () => {
    const get = mockDocuments(0, status)
    const params = withPageSink({ page: 1, limit: 10 })
    expect(await list(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    mockDocuments(5, status)
    const params = parseListQuery({ page: '2', limit: '2' })
    const rows = await list(CREDS, params)
    const env = listPage(rows, params, 'cloudsign')
    expect(env.data.map((r) => r.id)).toEqual(['doc-2', 'doc-3'])
    expect(env.meta.page).toBe(2)
    expect(env.meta.limit).toBe(2)
    expect(env.meta.hasMore).toBe(true)
  })
})

describe('CloudSignAdapter child lists page GET /documents/{id} locally', () => {
  const ENV = 'env-1'
  const L = 2
  const N = 2 * L + 1

  /** Honours only the documented path id; ignores every query param. */
  function mockDocument(participants: number) {
    return vi.spyOn(CloudSignClient.prototype, 'get').mockImplementation(async (path: string) => {
      if (path !== `/documents/${ENV}`) throw new Error(`unexpected path ${path}`)
      return {
        id: ENV,
        title: 'T',
        status: 1,
        participants: Array.from({ length: participants }, (_, i) => ({
          id: `p-${i}`,
          email: `p${i}@example.com`,
          name: `P${i}`,
          order: i,
        })),
        files: [],
      } as never
    })
  }

  it('listSigners: pages 1..3 return every participant once, with an exact hasMore', async () => {
    const get = mockDocument(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listSigners(CREDS, ENV, params)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => `p-${i}`))
    expect(more).toEqual([true, true, false])
    for (const c of get.mock.calls) expect(c).toEqual([`/documents/${ENV}`])
  })

  it('listSigners on the API path through parseListQuery and listPage', async () => {
    mockDocument(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const rows = await adapter.listSigners(CREDS, ENV, params)
    const env = listPage(rows, params, 'cloudsign')
    expect(env.data.map((r) => r.id)).toEqual(['p-2', 'p-3'])
    expect(env.meta.totalCount).toBe(N)
    expect(env.meta.hasMore).toBe(true)
  })

  it('listSigners without a limit returns every participant', async () => {
    mockDocument(N)
    expect(await adapter.listSigners(CREDS, ENV, {})).toHaveLength(N)
  })

  it('listDocuments: page 1 holds the one document and page 2 is empty', async () => {
    mockDocument(0)
    const p1 = withPageSink({ page: 1, limit: 1 })
    expect((await adapter.listDocuments(CREDS, ENV, p1)).map((d) => d.id)).toEqual([ENV])
    expect(readUpstreamPage(p1)?.hasMore).toBe(false)
    const p2 = withPageSink({ page: 2, limit: 1 })
    expect(await adapter.listDocuments(CREDS, ENV, p2)).toEqual([])
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
  })
})

describe('CloudSignAdapter envelopes and templates walk separately', () => {
  /**
   * A fake `GET /documents` over a mix of statuses: even ids are templates
   * (status 4), odd ids are in progress (status 1). `status=4` selects only
   * the templates; no `status` returns everything.
   */
  function mockMixed(n: number) {
    const all = Array.from({ length: n }, (_, i) => ({
      id: `doc-${i}`,
      title: `Doc ${i}`,
      status: i % 2 === 0 ? 4 : 1,
      participants: [],
      files: [],
    }))
    return vi
      .spyOn(CloudSignClient.prototype, 'get')
      .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
        if (path !== '/documents') throw new Error(`unexpected path ${path}`)
        const asked = Number(params?.['page'])
        const page = Number.isInteger(asked) && asked >= 1 ? asked : 1
        const wanted = params?.['status'] === undefined ? -1 : Number(params['status'])
        const rows = all.filter((d) => wanted === -1 || d.status === wanted)
        return {
          total: rows.length,
          page,
          documents: rows.slice((page - 1) * UPSTREAM, page * UPSTREAM),
        } as never
      })
  }

  it('listTemplates page 2 after listEnvelopes page 1 on one connection serves templates only', async () => {
    mockMixed(10)
    const env = await adapter.listEnvelopes(CREDS, withPageSink({ page: 1, limit: 2 }))
    expect(env.map((r) => r.id)).toEqual(['doc-0', 'doc-1'])
    const params = withPageSink({ page: 2, limit: 2 })
    const tpl = await adapter.listTemplates(CREDS, params)
    // Templates are doc-0, doc-2, doc-4, doc-6, doc-8; page 2 at limit 2.
    expect(tpl.map((r) => r.id)).toEqual(['doc-4', 'doc-6'])
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    const env2 = await adapter.listEnvelopes(CREDS, withPageSink({ page: 2, limit: 2 }))
    expect(env2.map((r) => r.id)).toEqual(['doc-2', 'doc-3'])
  })
})

describe.each(TOP)('CloudSignAdapter.%s with no limit', (_name, list, status) => {
  it('returns the adapter default of 50 rows, not the shared default', async () => {
    mockDocuments(120, status)
    const params = withPageSink({ page: 1 })
    const rows = await list(CREDS, params)
    expect(rows).toHaveLength(50)
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })
})

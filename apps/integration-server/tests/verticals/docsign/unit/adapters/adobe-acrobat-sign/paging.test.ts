/**
 * Adobe Acrobat Sign list paging.
 *
 * The v6 spec (https://secure.na1.adobesign.com/restapijson/v6/restapi.json,
 * rendered at https://secure.na1.adobesign.com/public/docs/restapi/v6) gives
 * GET /agreements and GET /libraryDocuments two paging params:
 *   cursor:   "Used to navigate through the pages. If not provided, returns the first page."
 *   pageSize: "Number of intended items in the response page. If not provided, it is decided by the application settings."
 * and a response `page` of type PageInfo { nextCursor }. No maximum pageSize is
 * documented, so the adapter declares none and sends the caller's limit.
 *
 * GET /agreements/{id}/members, /documents and /events take no paging params
 * and have no `page` in the response: the whole collection comes back, and
 * the adapter slices it locally.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import {
  _resetCursorPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { AdobeAcrobatSignAdapter } from '../../../../../../src/verticals/docsign/adapters/adobe-acrobat-sign/index'
import { DEFAULT_PAGE_SIZE } from '../../../../../../src/verticals/docsign/adapters/adobe-acrobat-sign/constants'

const CREDS = {
  accessToken: 'adobe_test',
  refreshToken: 'adobe_refresh',
  extra: { apiAccessPoint: 'https://api.na1.adobesign.com' },
}
const CREDS_B = { ...CREDS, accessToken: 'adobe_test_b', refreshToken: 'adobe_refresh_b' }
const APP_DEFAULT_PAGE_SIZE = 20
const CALL_BUDGET = 30

const encode = (offset: number) => Buffer.from(`o:${offset}`).toString('base64')
const decode = (cursor: string) => {
  const text = Buffer.from(cursor, 'base64').toString()
  if (!text.startsWith('o:')) throw new Error(`400: invalid cursor ${cursor}`)
  return Number(text.slice(2))
}

/**
 * A fake Adobe Sign v6 honouring ONLY the documented params: `cursor` and
 * `pageSize` on the two collection endpoints, nothing on the per-agreement
 * endpoints. Any other query param is refused.
 */
function fakeAdobe(total: number) {
  const agreements = Array.from({ length: total }, (_, i) => ({
    id: `a${i + 1}`,
    name: `Agreement ${i + 1}`,
    status: 'SIGNED',
  }))
  const library = Array.from({ length: total }, (_, i) => ({
    id: `l${i + 1}`,
    name: `Lib ${i + 1}`,
  }))
  let calls = 0
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    if (++calls > CALL_BUDGET) throw new Error(`call budget (${CALL_BUDGET}) exceeded`)
    const params = cfg?.params ?? {}
    const collection: Record<string, { key: string; rows: unknown[] }> = {
      '/agreements': { key: 'userAgreementList', rows: agreements },
      '/libraryDocuments': { key: 'libraryDocumentList', rows: library },
    }
    const hit = collection[path]
    if (hit) {
      for (const k of Object.keys(params)) {
        if (k !== 'cursor' && k !== 'pageSize') throw new Error(`400: unknown param ${k}`)
      }
      const size = params['pageSize'] === undefined ? APP_DEFAULT_PAGE_SIZE : params['pageSize']
      if (typeof size !== 'number' || !Number.isInteger(size) || size < 1) {
        throw new Error(`400: bad pageSize ${String(size)}`)
      }
      const start = params['cursor'] === undefined ? 0 : decode(String(params['cursor']))
      const end = start + size
      return {
        data: {
          [hit.key]: hit.rows.slice(start, end),
          page: end < hit.rows.length ? { nextCursor: encode(end) } : {},
        },
      }
    }
    if (Object.keys(params).length > 0) throw new Error(`400: ${path} takes no query params`)
    if (path === '/agreements/env1/members') {
      return {
        data: {
          participantSets: [
            {
              id: 'ps1',
              role: 'SIGNER',
              order: 1,
              memberInfos: Array.from({ length: total }, (_, i) => ({
                id: `m${i + 1}`,
                email: `m${i + 1}@example.com`,
              })),
            },
          ],
        },
      }
    }
    if (path === '/agreements/env1/documents') {
      return {
        data: {
          documents: Array.from({ length: total }, (_, i) => ({
            id: `d${i + 1}`,
            name: `D${i + 1}`,
          })),
        },
      }
    }
    if (path === '/agreements/env1/events') {
      return {
        data: {
          events: Array.from({ length: total }, (_, i) => ({
            type: 'ACTION_COMPLETED',
            date: '2025-01-01T00:00:00Z',
            description: `e${i}`,
          })),
        },
      }
    }
    throw new Error(`unexpected path ${path}`)
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn(), put: vi.fn() } as never)
  return { get }
}

const adapter = () =>
  new AdobeAcrobatSignAdapter({ clientId: '', clientSecret: '', redirectUri: '' })

const CURSOR_METHODS = [
  {
    name: 'listEnvelopes',
    path: '/agreements',
    prefix: 'a',
    call: (a: AdobeAcrobatSignAdapter, p: QueryParams, c = CREDS) => a.listEnvelopes(c, p),
  },
  {
    name: 'listTemplates',
    path: '/libraryDocuments',
    prefix: 'l',
    call: (a: AdobeAcrobatSignAdapter, p: QueryParams, c = CREDS) => a.listTemplates(c, p),
  },
] as const

const LOCAL_METHODS = [
  {
    name: 'listSigners',
    id: (i: number) => `ps1:m${i + 1}`,
    call: (a: AdobeAcrobatSignAdapter, p: QueryParams) => a.listSigners(CREDS, 'env1', p),
  },
  {
    name: 'listDocuments',
    id: (i: number) => `d${i + 1}`,
    call: (a: AdobeAcrobatSignAdapter, p: QueryParams) => a.listDocuments(CREDS, 'env1', p),
  },
  {
    name: 'listAuditTrailEntries',
    id: (i: number) => `env1:${i}`,
    call: (a: AdobeAcrobatSignAdapter, p: QueryParams) => a.listAuditTrailEntries(CREDS, 'env1', p),
  },
] as const

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe('adobe-acrobat-sign capabilities', () => {
  it('declares no maxPageSize: the v6 spec documents no pageSize maximum', () => {
    const caps = (adapter() as { capabilities?: { maxPageSize?: number } }).capabilities
    expect(caps?.maxPageSize).toBeUndefined()
  })
})

describe.each(CURSOR_METHODS)(
  'adobe-acrobat-sign $name cursor paging',
  ({ call, path, prefix }) => {
    const L = 4
    const N = 2 * L + 1
    const expected = Array.from({ length: N }, (_, i) => `${prefix}${i + 1}`)

    it('pages 1..3 at limit L return every row once, in order, with exact hasMore', async () => {
      fakeAdobe(N)
      const seen: string[] = []
      const more: Array<boolean | undefined> = []
      for (const k of [1, 2, 3]) {
        const params = withPageSink({ page: k, limit: L })
        seen.push(...(await call(adapter(), params)).map((r) => r.id))
        more.push(readUpstreamPage(params)?.hasMore)
      }
      expect(seen).toEqual(expected)
      expect(more).toEqual([true, true, false])
    })

    it('the page-2 request carries the documented cursor from page 1 and pageSize = limit', async () => {
      const { get } = fakeAdobe(N)
      await call(adapter(), withPageSink({ page: 1, limit: L }))
      await call(adapter(), withPageSink({ page: 2, limit: L }))
      expect(get).toHaveBeenNthCalledWith(1, path, { params: { pageSize: L } })
      expect(get).toHaveBeenNthCalledWith(2, path, { params: { pageSize: L, cursor: encode(L) } })
    })

    it('a cold page 2 walks the cursor chain from page 1', async () => {
      const { get } = fakeAdobe(N)
      const ids = (await call(adapter(), withPageSink({ page: 2, limit: L }))).map((r) => r.id)
      expect(ids).toEqual(expected.slice(L, 2 * L))
      expect(get).toHaveBeenCalledTimes(2)
    })

    it('a large limit is sent verbatim (no documented maximum to clamp to)', async () => {
      const { get } = fakeAdobe(N)
      const params = parseListQuery({ limit: '500' })
      const rows = await call(adapter(), params)
      expect(rows).toHaveLength(N)
      expect(get.mock.calls[0]?.[1]).toEqual({ params: { pageSize: params.limit } })
      expect(readUpstreamPage(params)?.hasMore).toBe(false)
    })

    it('the API path: parseListQuery + listPage serves page 2 with meta.hasMore', async () => {
      fakeAdobe(N)
      await call(adapter(), parseListQuery({ page: '1', limit: String(L) }))
      const params = parseListQuery({ page: '2', limit: String(L) })
      const env = listPage<{ id: string }>(
        await call(adapter(), params),
        params,
        'adobe-acrobat-sign',
      )
      expect(env.data.map((r) => r.id)).toEqual(expected.slice(L, 2 * L))
      expect(env.meta.hasMore).toBe(true)
    })

    it('remembered cursors are per connection: another connection on the same apiAccessPoint re-walks', async () => {
      const { get } = fakeAdobe(N)
      await call(adapter(), withPageSink({ page: 1, limit: L }), CREDS)
      get.mockClear()
      const ids = (await call(adapter(), withPageSink({ page: 2, limit: L }), CREDS_B)).map(
        (r) => r.id,
      )
      expect(ids).toEqual(expected.slice(L, 2 * L))
      expect(get).toHaveBeenCalledTimes(2)
      expect(get).toHaveBeenNthCalledWith(1, path, { params: { pageSize: L } })
    })

    it('remembered cursors are per limit: page 2 at a new limit does not reuse the old walk', async () => {
      const { get } = fakeAdobe(N)
      await call(adapter(), withPageSink({ page: 1, limit: L }))
      get.mockClear()
      const M = L + 1
      const ids = (await call(adapter(), withPageSink({ page: 2, limit: M }))).map((r) => r.id)
      expect(ids).toEqual(expected.slice(M, 2 * M))
      expect(get).toHaveBeenNthCalledWith(1, path, { params: { pageSize: M } })
    })

    it('with no limit, the adapter default pageSize is sent', async () => {
      const { get } = fakeAdobe(N)
      await call(adapter(), withPageSink({ page: 1 }))
      expect(get).toHaveBeenNthCalledWith(1, path, { params: { pageSize: DEFAULT_PAGE_SIZE } })
    })

    it('an explicit caller cursor is still forwarded for one page', async () => {
      const { get } = fakeAdobe(N)
      const params = withPageSink({ limit: L, cursor: encode(2 * L) } as QueryParams)
      const ids = (await call(adapter(), params)).map((r) => r.id)
      expect(ids).toEqual(expected.slice(2 * L))
      expect(get).toHaveBeenCalledWith(path, { params: { pageSize: L, cursor: encode(2 * L) } })
      expect(readUpstreamPage(params)?.hasMore).toBe(false)
    })
  },
)

describe.each(LOCAL_METHODS)('adobe-acrobat-sign $name local paging', ({ call, id }) => {
  const L = 3
  const N = 2 * L + 1
  const expected = Array.from({ length: N }, (_, i) => id(i))

  it('pages 1..3 at limit L return every row once, in order, with exact hasMore', async () => {
    fakeAdobe(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const k of [1, 2, 3]) {
      const params = withPageSink({ page: k, limit: L })
      const page = await call(adapter(), params)
      expect(page.length).toBeLessThanOrEqual(L)
      seen.push(...page.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    expect(seen).toEqual(expected)
    expect(more).toEqual([true, true, false])
  })

  it('the API path: parseListQuery + listPage serves page 2 with meta.hasMore', async () => {
    fakeAdobe(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const env = listPage<{ id: string }>(
      await call(adapter(), params),
      params,
      'adobe-acrobat-sign',
    )
    expect(env.data.map((r) => r.id)).toEqual(expected.slice(L, 2 * L))
    expect(env.meta.hasMore).toBe(true)
  })

  it('with no limit, every row is returned', async () => {
    fakeAdobe(N)
    expect((await call(adapter(), {})).map((r) => r.id)).toEqual(expected)
  })
})

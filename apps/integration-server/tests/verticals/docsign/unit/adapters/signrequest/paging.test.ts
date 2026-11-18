import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { Credentials, PageMaxBearing, QueryParams } from '@opensteward/shared'
import { SignRequestClient } from '../../../../../../src/verticals/docsign/adapters/signrequest/client'
import { SignrequestAdapter } from '../../../../../../src/verticals/docsign/adapters/signrequest'
import { DEFAULT_PAGE_SIZE } from '../../../../../../src/verticals/docsign/adapters/signrequest/constants'

/**
 * `GET /documents/`, `GET /templates/` and `GET /events/` are DRF-paginated:
 * `page` ("A page number within the paginated result set.") and `limit`
 * ("Number of results to return per page."), answered with
 * `{ count, next, previous, results }` where `next` is null on the last page
 * (https://signrequest.com/api/v1/docs/?format=openapi).
 *
 * Signers and the document itself come from `GET /documents/{uuid}/`, which
 * takes no query parameter: the adapter pages them itself. The docs name no
 * maximum `limit`, so the adapter declares none.
 */

const CREDS = { accessToken: 'tok' } as Credentials
const DOC = 'doc-1'
const L = 2
const N = 2 * L + 1
const BASE = 'https://signrequest.com/api/v1'

function documentRow(i: number) {
  return { uuid: `d${i}`, name: `Doc ${i}.pdf`, status: 'se', created: '2024-01-15T10:00:00.000Z' }
}

function templateRow(i: number) {
  return { uuid: `t${i}`, name: `Template ${i}`, created: '2024-01-10T08:00:00.000Z' }
}

function eventRow(i: number, withUuid = true) {
  return {
    ...(withUuid ? { uuid: `ev${i}` } : {}),
    event_type: 'viewed',
    timestamp: '2024-02-01T14:20:00.000Z',
    document: { uuid: DOC },
  }
}

function detail(n: number) {
  return {
    ...documentRow(0),
    uuid: DOC,
    signrequest: {
      uuid: 'sr-1',
      from_email: 'owner@example.com',
      signers: Array.from({ length: n }, (_, i) => ({
        uuid: `s${i}`,
        email: `s${i}@example.com`,
        order: i,
        needs_to_sign: true,
      })),
    },
  }
}

/**
 * A SignRequest that honours ONLY the documented `page` and `limit` (and the
 * `document__uuid` filter on events). `next` is null on the last page.
 */
function mockSignRequest(n: number, opts: { eventUuids?: boolean } = {}) {
  return vi
    .spyOn(SignRequestClient.prototype, 'get')
    .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      if (path === `/documents/${DOC}/`) {
        if (params !== undefined) throw new Error('the detail call takes no query parameters')
        return detail(n) as never
      }
      const page = typeof params?.['page'] === 'number' ? params['page'] : 1
      const limit = typeof params?.['limit'] === 'number' ? params['limit'] : 10
      let all: unknown[]
      if (path === '/documents/') all = Array.from({ length: n }, (_, i) => documentRow(i))
      else if (path === '/templates/') all = Array.from({ length: n }, (_, i) => templateRow(i))
      else if (path === '/events/') {
        all =
          params?.['document__uuid'] === DOC
            ? Array.from({ length: n }, (_, i) => eventRow(i, opts.eventUuids ?? true))
            : []
      } else throw new Error(`unexpected path ${path}`)
      const start = (page - 1) * limit
      const last = start + limit >= all.length
      return {
        count: all.length,
        next: last ? null : `${BASE}${path}?limit=${limit}&page=${page + 1}`,
        previous: page > 1 ? `${BASE}${path}?limit=${limit}&page=${page - 1}` : null,
        results: all.slice(start, start + limit),
      } as never
    })
}

afterEach(() => vi.restoreAllMocks())

const adapter = new SignrequestAdapter()

type Lister = (c: Credentials, p: QueryParams) => Promise<Array<{ id: string }>>
const PAGED: Array<[string, Lister, string, (i: number) => string]> = [
  ['listEnvelopes', (c, p) => adapter.listEnvelopes(c, p), '/documents/', (i) => `d${i}`],
  ['listTemplates', (c, p) => adapter.listTemplates(c, p), '/templates/', (i) => `t${i}`],
  [
    'listAuditTrailEntries',
    (c, p) => adapter.listAuditTrailEntries(c, DOC, p),
    '/events/',
    (i) => `ev${i}`,
  ],
]

describe.each(PAGED)('SignrequestAdapter.%s pages by page + limit', (_name, list, path, idOf) => {
  const ids = Array.from({ length: N }, (_, i) => idOf(i))

  it('pages 1..3 return every id once, in order, with an exact hasMore', async () => {
    mockSignRequest(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await list(CREDS, params)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
    }
    expect(seen).toEqual(ids)
    expect(more).toEqual([true, true, false])
  })

  it('reads the end from `next`, not from a full page (N = 2L)', async () => {
    mockSignRequest(2 * L)
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2]) {
      const params = withPageSink({ page, limit: L })
      expect(await list(CREDS, params)).toHaveLength(L)
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(more).toEqual([true, false])
  })

  it('with no page or limit, asks for page 1 at DEFAULT_PAGE_SIZE', async () => {
    const get = mockSignRequest(3)
    await list(CREDS, {})
    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith(
      path,
      expect.objectContaining({ page: 1, limit: DEFAULT_PAGE_SIZE }),
    )
  })

  it('the page-2 request carries page=2 and the caller limit', async () => {
    const get = mockSignRequest(N)
    await list(CREDS, withPageSink({ page: 2, limit: L }))
    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith(path, expect.objectContaining({ page: 2, limit: L }))
  })

  it('sends the caller limit as is (no documented maximum to clamp to)', async () => {
    const get = mockSignRequest(3)
    const params = withPageSink({ page: 1, limit: 250 })
    const rows = await list(CREDS, params)
    expect(get).toHaveBeenCalledWith(path, expect.objectContaining({ page: 1, limit: 250 }))
    expect(rows).toHaveLength(3)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    mockSignRequest(N)
    const params = parseListQuery({ page: '2', limit: String(L) }, adapter as PageMaxBearing)
    const rows = await list(CREDS, params)
    const env = listPage(rows, params, 'signrequest')
    expect(env.data.map((r) => r.id)).toEqual(ids.slice(L, 2 * L))
    expect(env.meta.page).toBe(2)
    expect(env.meta.hasMore).toBe(true)
  })
})

describe('SignrequestAdapter.listEnvelopes status filter', () => {
  it('passes status through to GET /documents/ alongside the paging params', async () => {
    const get = mockSignRequest(3)
    await adapter.listEnvelopes(CREDS, withPageSink({ page: 1, limit: L, status: 'se' }))
    expect(get).toHaveBeenCalledWith(
      '/documents/',
      expect.objectContaining({ status: 'se', page: 1, limit: L }),
    )
  })
})

describe('SignrequestAdapter.listAuditTrailEntries fallback ids', () => {
  it('numbers events without a uuid by their position in the whole trail', async () => {
    mockSignRequest(N, { eventUuids: false })
    const seen: string[] = []
    for (const page of [1, 2, 3]) {
      const rows = await adapter.listAuditTrailEntries(CREDS, DOC, withPageSink({ page, limit: L }))
      seen.push(...rows.map((r) => r.id))
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => `${DOC}:${i}`))
  })
})

type ChildLister = (c: Credentials, id: string, p: QueryParams) => Promise<Array<{ id: string }>>

describe('SignrequestAdapter.listSigners pages the inline signers locally', () => {
  const list: ChildLister = (c, id, p) => adapter.listSigners(c, id, p)
  const ids = Array.from({ length: N }, (_, i) => `s${i}`)

  it('pages 1..3 return every id once, in order, with an exact hasMore', async () => {
    mockSignRequest(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await list(CREDS, DOC, params)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    expect(seen).toEqual(ids)
    expect(more).toEqual([true, true, false])
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    mockSignRequest(N)
    const params = parseListQuery({ page: '2', limit: String(L) }, adapter as PageMaxBearing)
    const rows = await list(CREDS, DOC, params)
    const env = listPage(rows, params, 'signrequest')
    expect(env.data.map((r) => r.id)).toEqual(ids.slice(L, 2 * L))
    expect(env.meta.hasMore).toBe(true)
  })

  it('getSigner still finds a signer past the first page', async () => {
    mockSignRequest(N)
    const s = await adapter.getSigner(CREDS, `${DOC}:s${N - 1}`)
    expect(s.id).toBe(`s${N - 1}`)
  })

  it('getSigner reads every signer, not one default page', async () => {
    const many = DEFAULT_PAGE_SIZE + 5
    mockSignRequest(many)
    const s = await adapter.getSigner(CREDS, `${DOC}:s${many - 1}`)
    expect(s.id).toBe(`s${many - 1}`)
  })
})

describe('SignrequestAdapter.listDocuments pages the single file locally', () => {
  it('page 1 holds the document, page 2 is empty, hasMore exact', async () => {
    mockSignRequest(N)
    const p1 = withPageSink({ page: 1, limit: 1 })
    expect((await adapter.listDocuments(CREDS, DOC, p1)).map((d) => d.id)).toEqual([DOC])
    expect(readUpstreamPage(p1)?.hasMore).toBe(false)
    const p2 = withPageSink({ page: 2, limit: 1 })
    expect(await adapter.listDocuments(CREDS, DOC, p2)).toEqual([])
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
  })
})

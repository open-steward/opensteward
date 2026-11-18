/**
 * SuiteProjects Pro pages its list endpoints with `limit` and `offset`, and
 * answers with a `meta` object whose `links` omit rel="next" on the last page
 * (https://docs.oracle.com/en/cloud/saas/netsuite-suiteprojects-pro/online-help/article_160035263040.html):
 * "You can set the maximum number of objects to be returned per page between
 * 1 and 1000." (the parameter table's Default column reads 100 for `limit`),
 * "The offset must be a positive number divisible by the page limit" and
 * "next - the URL for the next page. Not included if the page returned is the
 * last page."
 *
 * Every list used to read only `params.cursor` for its offset, so caller
 * page 2 repeated page 1. The fake honours ONLY `limit`, `offset` and the
 * `q` filter each method sends.
 *
 * listComments is deliberately absent: it calls `/threaded-messages/`, which
 * the docs do not have (messages live at /threaded-discussions/{id}/messages).
 * It is rebuild backlog, not a paging fix, so no fake here pins that path.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { SuiteprojectsProAdapter } from '../../../../../../src/verticals/projects/adapters/suiteprojects-pro/index'

vi.mock('axios')

const C1: Credentials = { accessToken: 'tok-1', extra: { companyId: 'acme' } }

/** The documented `limit` ceiling. */
const SPP_MAX = 1000

type Kind = 'projects' | 'tasks' | 'users'

interface Req {
  path: string
  params: Record<string, unknown>
}

function matches(kind: Kind, path: string, params: Record<string, unknown>): boolean {
  switch (kind) {
    case 'projects':
      return path === '/projects/'
    case 'tasks':
      return path === '/project-tasks/' && params['q'] === "projectId IS 'p1'"
    case 'users':
      return path === '/users/'
  }
}

function ids(from: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => String(1000 + from + i))
}

function row(kind: Kind, n: number): Record<string, unknown> {
  const id = 1000 + n
  switch (kind) {
    case 'projects':
      return { id, name: `p${id}` }
    case 'tasks':
      return { id, name: `t${id}`, projectId: 'p1', classification: 'T' }
    case 'users':
      return { id, name: `u${id}`, email: `u${id}@example.com` }
  }
}

/** A SuiteProjects Pro collection of `total` rows honouring only `limit` and `offset`. */
function fakeSpp(kind: Kind, total: number, opts: { links?: boolean } = {}): { requests: Req[] } {
  const requests: Req[] = []
  vi.mocked(axios.create).mockImplementation((() => {
    const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
      const params = { ...(cfg?.params ?? {}) }
      requests.push({ path, params })
      if (!matches(kind, path, params)) throw new Error(`unexpected request ${path}`)
      const limit = Number(params['limit'] ?? 100)
      const offset = Number(params['offset'] ?? 0)
      if (!Number.isInteger(limit) || limit < 1 || limit > SPP_MAX)
        throw new Error(`limit ${String(params['limit'])} out of range`)
      if (!Number.isInteger(offset) || offset < 0 || offset % limit !== 0)
        throw new Error(`offset ${String(params['offset'])} not divisible by limit`)
      const all = Array.from({ length: total }, (_, i) => row(kind, i))
      const data = all.slice(offset, offset + limit)
      const url = (o: number) =>
        `https://acme.app.netsuitesuiteprojectspro.com/rest/v1${path}?limit=${limit}&offset=${o}`
      const links = [{ rel: 'self', href: url(offset) }]
      if (offset + limit < total) links.push({ rel: 'next', href: url(offset + limit) })
      return {
        data: {
          message: 'success',
          data,
          meta: {
            rowsPerPage: limit,
            totalPages: Math.ceil(total / limit),
            totalRows: total,
            ...(opts.links === false ? {} : { links }),
          },
        },
      }
    })
    return { get } as unknown as ReturnType<typeof axios.create>
  }) as unknown as typeof axios.create)
  return { requests }
}

function adapter(): SuiteprojectsProAdapter {
  return new SuiteprojectsProAdapter({
    clientId: 'id',
    clientSecret: 's',
    redirectUri: 'https://x/cb',
  })
}

async function list(
  a: SuiteprojectsProAdapter,
  kind: Kind,
  params: QueryParams,
): Promise<Array<{ id: string }>> {
  switch (kind) {
    case 'projects':
      return a.listProjects(C1, params)
    case 'tasks':
      return a.listTasks(C1, 'p1', params)
    case 'users':
      return a.listUsers(C1, '', params)
  }
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe.each<Kind>(['projects', 'tasks', 'users'])('suiteprojects-pro %s paging', (kind) => {
  it('pages 1..3 of 2L+1 rows serve every id once, in order, with exact hasMore', async () => {
    const L = 4
    fakeSpp(kind, 2 * L + 1)
    const a = adapter()
    const served: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await list(a, kind, params)
      served.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(served).toEqual(ids(0, 2 * L + 1))
    expect(more).toEqual([true, true, false])
  })

  it('an exact multiple (2L rows) ends on the missing next link, not on a full page', async () => {
    const L = 4
    fakeSpp(kind, 2 * L)
    const a = adapter()
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2]) {
      const params = withPageSink({ page, limit: L })
      await list(a, kind, params)
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(more).toEqual([true, false])
  })

  it('reports meta.totalRows as totalCount', async () => {
    fakeSpp(kind, 37)
    const params = withPageSink({ page: 1, limit: 10 })
    await list(adapter(), kind, params)
    expect(readUpstreamPage(params)?.totalCount).toBe(37)
  })

  it('the page-2 request carries offset=limit and limit=limit', async () => {
    const { requests } = fakeSpp(kind, 20)
    await list(adapter(), kind, withPageSink({ page: 2, limit: 7 }))
    expect(requests[0]!.params).toMatchObject({ limit: 7, offset: 7 })
  })

  it('a direct limit above the documented 1,000 is clamped and reported', async () => {
    const { requests } = fakeSpp(kind, 3)
    const params = withPageSink({ page: 2, limit: 5000 })
    await list(adapter(), kind, params)
    expect(requests[0]!.params).toMatchObject({ limit: SPP_MAX, offset: SPP_MAX })
    expect(readUpstreamPage(params)?.pageSize).toBe(SPP_MAX)
  })

  it('a limit within range reports no pageSize override', async () => {
    fakeSpp(kind, 20)
    const params = withPageSink({ page: 1, limit: 7 })
    await list(adapter(), kind, params)
    expect(readUpstreamPage(params)?.pageSize).toBeUndefined()
  })

  it('with no limit it sends the API default of 100 and strides by it', async () => {
    const { requests } = fakeSpp(kind, 3)
    await list(adapter(), kind, withPageSink({ page: 2 }))
    expect(requests[0]!.params).toMatchObject({ limit: 100, offset: 100 })
  })

  it('without meta.links, a short page ends the walk and a full page does not', async () => {
    const L = 4
    fakeSpp(kind, L + 1, { links: false })
    const a = adapter()
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2]) {
      const params = withPageSink({ page, limit: L })
      await list(a, kind, params)
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(more).toEqual([true, false])
  })

  it('a direct limit of 0 still sends limit=1', async () => {
    const { requests } = fakeSpp(kind, 3)
    await list(adapter(), kind, withPageSink({ page: 1, limit: 0 }))
    expect(requests[0]!.params['limit']).toBe(1)
  })

  it('API path: parseListQuery + listPage walks the whole collection once', async () => {
    fakeSpp(kind, 53)
    const a = adapter()
    const served: string[] = []
    for (let page = 1; page < 20; page++) {
      const params = parseListQuery({ limit: '25', page: String(page) })
      const env = listPage(await list(a, kind, params), params, 'suiteprojects-pro')
      served.push(...env.data.map((r) => r.id))
      if (env.meta.hasMore !== true) break
    }
    expect(served).toEqual(ids(0, 53))
  })
})

describe('suiteprojects-pro capabilities', () => {
  // listComments still ignores `page` (rebuild backlog), so not every list
  // method honours the requested size and maxPageSize must stay undeclared.
  it('does not declare maxPageSize while listComments is unfixed', () => {
    const a = adapter() as { capabilities?: { maxPageSize?: number } }
    expect(a.capabilities?.maxPageSize).toBeUndefined()
  })
})

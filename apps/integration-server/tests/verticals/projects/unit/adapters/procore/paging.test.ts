/**
 * Procore pages its list endpoints with `page` (1-based) and `per_page`, and
 * answers with a `Link` header whose `rel="next"` is omitted on the last page,
 * plus `Total` and `Per-Page` headers
 * (https://developers.procore.com/documentation/pagination, source
 * https://github.com/procore/documentation/blob/main/plan_your_app/pagination.md):
 * "We recommend keeping `per_page` at or below **2,000**." and "On the last
 * page, `next` is omitted."
 *
 * `GET /rest/v1.0/companies`, `/companies/{company_id}/users`,
 * `/projects?company_id=…` and `/projects/{project_id}/rfis` each document the
 * `page` and `per_page` query parameters and the `Link`, `Total` and
 * `Per-Page` response headers (developers.procore.com/api/v1/resource_groups/
 * resource/{companies,company-users,projects,rfis}?version=rest_v1.0).
 *
 * `GET /rest/v1.0/projects/{project_id}/rfis/{rfi_id}/replies` (List RFI
 * Replies) documents the same parameters and headers
 * (…/resource/replies?version=rest_v1.0); comments used to call an
 * `rfi_comments` path that is in no Procore resource group.
 *
 * Every call but List Companies must carry `Procore-Company-Id`
 * (https://developers.procore.com/documentation/tutorial-mpz): "Each call your
 * application makes to the Procore API must contain a request header that
 * includes the `Procore-Company-Id` field." The fake rejects a request
 * without it, as Procore does ("Missing Procore-Company-Id header!").
 *
 * Every list used to read only `params.cursor`, so caller page 2 repeated
 * page 1. The fake honours ONLY `page` and `per_page`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { ProcoreAdapter } from '../../../../../../src/verticals/projects/adapters/procore/index'

vi.mock('axios')

/** A connection configured with its Procore company. */
const C1: Credentials = { accessToken: 'tok-1', extra: { companyId: 'c1' } }
/** A connection with no company configured. */
const NO_COMPANY: Credentials = { accessToken: 'tok-1', extra: {} }

/** Procore's documented per_page recommendation ceiling. */
const PROCORE_MAX = 2000

type Kind = 'workspaces' | 'users' | 'tasks' | 'projects' | 'comments'

interface Req {
  path: string
  params: Record<string, unknown>
  headers: Record<string, unknown>
}

function matches(kind: Kind, path: string, params: Record<string, unknown>): boolean {
  switch (kind) {
    case 'workspaces':
      return path === '/companies'
    case 'users':
      return path === '/companies/c1/users'
    case 'tasks':
      return path === '/projects/p1/rfis'
    case 'projects':
      return path === '/projects' && params['company_id'] === 'c1'
    case 'comments':
      return path === '/projects/p1/rfis/r1/replies'
  }
}

function idOf(kind: Kind, n: number): string {
  return `${kind}-${String(n).padStart(4, '0')}`
}

function ids(kind: Kind, from: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => servedId(kind, from + i))
}

function row(kind: Kind, n: number): Record<string, unknown> {
  const id = idOf(kind, n)
  switch (kind) {
    case 'workspaces':
      return { id, name: id, is_active: true }
    case 'users':
      return { id, name: id, first_name: id, last_name: 'X', email_address: `${id}@example.com` }
    case 'tasks':
      return { id, subject: id, status: 'open', number: String(n) }
    case 'projects':
      return { id, name: id, company: { id: 'c1', name: 'C' } }
    case 'comments':
      return {
        id,
        official: false,
        answer_date: '2016-08-29T14:37:22Z',
        plain_text_body: id,
        rich_text_body: `<p>${id}</p>`,
        created_by: 'Jane Doe',
        created_by_id: 42,
        attachments: [],
      }
  }
}

/** The id each kind serves for row n: comments are `projectId:rfiId:replyId`. */
function servedId(kind: Kind, n: number): string {
  return kind === 'comments' ? `p1:r1:${idOf(kind, n)}` : idOf(kind, n)
}

/** A Procore collection of `total` rows honouring only `page` and `per_page`. */
function fakeProcore(kind: Kind, total: number): { requests: Req[] } {
  const requests: Req[] = []
  vi.mocked(axios.create).mockImplementation(((createCfg?: {
    headers?: Record<string, unknown>
  }) => {
    const headers = { ...(createCfg?.headers ?? {}) }
    const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
      const params = { ...(cfg?.params ?? {}) }
      requests.push({ path, params, headers })
      if (!matches(kind, path, params)) throw new Error(`unexpected path ${path}`)
      if (kind !== 'workspaces' && headers['Procore-Company-Id'] === undefined)
        throw new Error('Missing Procore-Company-Id header!')
      const page = Number(params['page'] ?? 1)
      const per = Number(params['per_page'] ?? 100)
      if (!Number.isInteger(page) || page < 1) throw new Error(`bad page ${String(params['page'])}`)
      if (!Number.isInteger(per) || per < 1 || per > PROCORE_MAX)
        throw new Error(`per_page ${String(params['per_page'])} out of range`)
      const all = Array.from({ length: total }, (_, i) => row(kind, i))
      const data = all.slice((page - 1) * per, page * per)
      const last = Math.max(1, Math.ceil(total / per))
      const url = (p: number) =>
        `https://api.procore.com/rest/v1.0${path}?page=${p}&per_page=${per}`
      const links = [`<${url(1)}>; rel="first"`]
      if (page > 1) links.push(`<${url(page - 1)}>; rel="prev"`)
      links.push(`<${url(last)}>; rel="last"`)
      if (page < last) links.push(`<${url(page + 1)}>; rel="next"`)
      return {
        data,
        headers: { link: links.join(', '), total: String(total), 'per-page': String(per) },
      }
    })
    return { get } as unknown as ReturnType<typeof axios.create>
  }) as unknown as typeof axios.create)
  return { requests }
}

function adapter(): ProcoreAdapter {
  return new ProcoreAdapter({ clientId: 'id', clientSecret: 's', redirectUri: 'https://x/cb' })
}

async function list(
  a: ProcoreAdapter,
  kind: Kind,
  params: QueryParams,
): Promise<Array<{ id: string }>> {
  switch (kind) {
    case 'workspaces':
      return a.listWorkspaces(C1, params)
    case 'users':
      return a.listUsers(C1, 'c1', params)
    case 'tasks':
      return a.listTasks(C1, 'p1', params)
    case 'projects':
      // Set in place: spreading would drop the non-enumerable page sink.
      return a.listProjects(C1, Object.assign(params, { workspace_id: 'c1' }))
    case 'comments':
      return a.listComments(C1, 'r1', Object.assign(params, { project_id: 'p1' }))
  }
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe.each<Kind>(['workspaces', 'users', 'tasks', 'projects', 'comments'])(
  'procore %s paging',
  (kind) => {
    it('pages 1..3 of 2L+1 rows serve every id once, in order, with exact hasMore', async () => {
      const L = 4
      fakeProcore(kind, 2 * L + 1)
      const a = adapter()
      const served: string[] = []
      const more: Array<boolean | undefined> = []
      for (const page of [1, 2, 3]) {
        const params = withPageSink({ page, limit: L })
        const rows = await list(a, kind, params)
        served.push(...rows.map((r) => r.id))
        more.push(readUpstreamPage(params)?.hasMore)
      }
      expect(served).toEqual(ids(kind, 0, 2 * L + 1))
      expect(more).toEqual([true, true, false])
    })

    it('an exact multiple (2L rows) ends on Link rel=next, not on a full page', async () => {
      const L = 4
      fakeProcore(kind, 2 * L)
      const a = adapter()
      const served: string[] = []
      const more: Array<boolean | undefined> = []
      for (const page of [1, 2]) {
        const params = withPageSink({ page, limit: L })
        const rows = await list(a, kind, params)
        served.push(...rows.map((r) => r.id))
        more.push(readUpstreamPage(params)?.hasMore)
      }
      expect(served).toEqual(ids(kind, 0, 2 * L))
      expect(more).toEqual([true, false])
    })

    it('reports the Total header as totalCount', async () => {
      fakeProcore(kind, 37)
      const params = withPageSink({ page: 1, limit: 10 })
      await list(adapter(), kind, params)
      expect(readUpstreamPage(params)?.totalCount).toBe(37)
    })

    it('a direct limit of 0 still sends per_page=1', async () => {
      const { requests } = fakeProcore(kind, 3)
      await list(adapter(), kind, withPageSink({ page: 1, limit: 0 }))
      expect(requests[0]!.params['per_page']).toBe(1)
    })

    it('the page-2 request carries page=2 and per_page=limit', async () => {
      const { requests } = fakeProcore(kind, 20)
      await list(adapter(), kind, withPageSink({ page: 2, limit: 7 }))
      expect(requests[0]!.params).toMatchObject({ page: 2, per_page: 7 })
    })

    it('a direct limit above the 2,000 recommendation is clamped and reported', async () => {
      const { requests } = fakeProcore(kind, 3)
      const params = withPageSink({ page: 1, limit: 5000 })
      await list(adapter(), kind, params)
      expect(requests[0]!.params['per_page']).toBe(PROCORE_MAX)
      expect(readUpstreamPage(params)?.pageSize).toBe(PROCORE_MAX)
    })

    it('API path: parseListQuery + listPage walks the whole collection once', async () => {
      fakeProcore(kind, 53)
      const a = adapter()
      const served: string[] = []
      for (let page = 1; page < 20; page++) {
        const params = parseListQuery({ limit: '25', page: String(page) })
        const env = listPage(await list(a, kind, params), params, 'procore')
        served.push(...env.data.map((r) => r.id))
        if (env.meta.hasMore !== true) break
      }
      expect(served).toEqual(ids(kind, 0, 53))
    })
  },
)

describe('procore Procore-Company-Id header', () => {
  it.each<Kind>(['users', 'tasks', 'projects', 'comments'])(
    '%s sends the company the call is made into',
    async (kind) => {
      const { requests } = fakeProcore(kind, 1)
      await list(adapter(), kind, withPageSink({ page: 1, limit: 5 }))
      expect(requests[0]!.headers['Procore-Company-Id']).toBe('c1')
    },
  )

  it('List Companies, which is exempt, sends none', async () => {
    const { requests } = fakeProcore('workspaces', 1)
    await list(adapter(), 'workspaces', withPageSink({ page: 1, limit: 5 }))
    expect(requests[0]!.headers).not.toHaveProperty('Procore-Company-Id')
  })

  it('listUsers sends the company named in its path, not the connection company', async () => {
    const { requests } = fakeProcore('users', 1)
    await adapter().listUsers(NO_COMPANY, 'c1', withPageSink({ page: 1, limit: 5 }))
    expect(requests[0]!.headers['Procore-Company-Id']).toBe('c1')
  })

  it.each<[string, Credentials]>([
    ['no connection company', NO_COMPANY],
    ['a different connection company', { accessToken: 'tok-1', extra: { companyId: 'c9' } }],
  ])(
    'listProjects sends the company_id it queries (workspace_id), with %s',
    async (_label, creds) => {
      const { requests } = fakeProcore('projects', 1)
      await adapter().listProjects(
        creds,
        Object.assign(withPageSink({ page: 1, limit: 5 }), { workspace_id: 'c1' }),
      )
      expect(requests).toHaveLength(1)
      expect(requests[0]!.params['company_id']).toBe('c1')
      expect(requests[0]!.headers['Procore-Company-Id']).toBe('c1')
    },
  )
})

describe('procore connection-company reads', () => {
  it('an integer credentials.extra.companyId is sent as the header and company_id', async () => {
    const requests: Req[] = []
    vi.mocked(axios.create).mockImplementation(((createCfg?: {
      headers?: Record<string, unknown>
    }) => {
      const headers = { ...(createCfg?.headers ?? {}) }
      const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
        requests.push({ path, params: { ...(cfg?.params ?? {}) }, headers })
        return { data: { id: 'p1', name: 'P', company: { id: 123, name: 'C' } }, headers: {} }
      })
      return { get } as unknown as ReturnType<typeof axios.create>
    }) as unknown as typeof axios.create)
    await adapter().getProject({ accessToken: 'tok-1', extra: { companyId: 123 } }, 'p1')
    expect(requests[0]!.params).toEqual({ company_id: '123' })
    expect(requests[0]!.headers['Procore-Company-Id']).toBe('123')
  })

  it.each<[string, unknown]>([
    ['an empty string', ''],
    ['a non-integer number', 1.5],
  ])('a companyId of %s refuses 501 and sends nothing', async (_label, companyId) => {
    const { requests } = fakeProcore('tasks', 1)
    await expect(
      adapter().listTasks(
        { accessToken: 'tok-1', extra: { companyId } } as Credentials,
        'p1',
        withPageSink({ page: 1, limit: 5 }),
      ),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(requests).toHaveLength(0)
  })

  it.each<[string, (a: ProcoreAdapter) => Promise<unknown>]>([
    ['listTasks', (a) => a.listTasks(NO_COMPANY, 'p1', withPageSink({ page: 1, limit: 5 }))],
    [
      'listComments',
      (a) =>
        a.listComments(
          NO_COMPANY,
          'r1',
          Object.assign(withPageSink({ page: 1, limit: 5 }), { project_id: 'p1' }),
        ),
    ],
    ['getProject', (a) => a.getProject(NO_COMPANY, 'p1')],
    ['getComment', (a) => a.getComment(NO_COMPANY, 'p1:r1:9')],
  ])('%s without credentials.extra.companyId refuses 501 and sends nothing', async (_m, call) => {
    const { requests } = fakeProcore('tasks', 1)
    await expect(call(adapter())).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringContaining('Procore-Company-Id'),
    })
    expect(requests).toHaveLength(0)
  })

  it('listComments without params.project_id refuses 501 and sends nothing', async () => {
    const { requests } = fakeProcore('comments', 1)
    await expect(
      adapter().listComments(C1, 'r1', withPageSink({ page: 1, limit: 5 })),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(requests).toHaveLength(0)
  })
})

describe('procore single reads', () => {
  function fakeGet(body: unknown): Req[] {
    const requests: Req[] = []
    vi.mocked(axios.create).mockImplementation(((createCfg?: {
      headers?: Record<string, unknown>
    }) => {
      const headers = { ...(createCfg?.headers ?? {}) }
      const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
        requests.push({ path, params: { ...(cfg?.params ?? {}) }, headers })
        return { data: body, headers: {} }
      })
      return { get } as unknown as ReturnType<typeof axios.create>
    }) as unknown as typeof axios.create)
    return requests
  }

  it('getComment reads a listed id back through Show RFI Reply', async () => {
    const requests = fakeGet({
      id: 999,
      official: true,
      answer_date: '2016-08-29T14:37:22Z',
      plain_text_body: 'No, they need to follow the guidelines on Schedule D',
      rich_text_body: '<p>No, they need to follow the guidelines on Schedule D</p>',
      created_by: 'Jane Doe',
      created_by_id: 42,
      attachments: [],
    })
    const c = await adapter().getComment(C1, 'p1:r1:999')
    expect(requests).toEqual([
      {
        path: '/projects/p1/rfis/r1/replies/999',
        params: {},
        headers: expect.objectContaining({ 'Procore-Company-Id': 'c1' }),
      },
    ])
    expect(c.id).toBe('p1:r1:999')
    expect(c.taskId).toBe('r1')
  })

  it.each(['999', 'r1:999', 'p1:r1:999:x', 'p1::999'])(
    'getComment rejects %s (not projectId:rfiId:replyId) before sending',
    async (id) => {
      const requests = fakeGet({})
      await expect(adapter().getComment(C1, id)).rejects.toThrow(/projectId:rfiId:replyId/)
      expect(requests).toHaveLength(0)
    },
  )

  it('getProject sends the documented company_id query and header', async () => {
    const requests = fakeGet({ id: 'p1', name: 'P', company: { id: 'c1', name: 'C' } })
    await adapter().getProject(C1, 'p1')
    expect(requests[0]!.path).toBe('/projects/p1')
    expect(requests[0]!.params).toEqual({ company_id: 'c1' })
    expect(requests[0]!.headers['Procore-Company-Id']).toBe('c1')
  })
})

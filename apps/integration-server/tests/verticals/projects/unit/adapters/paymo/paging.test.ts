/**
 * Paymo list paging: every list endpoint returns the whole collection, so each
 * is paged locally.
 *
 * Paymo's first-party API docs (https://github.com/paymo-org/api) document no
 * paging parameter on any endpoint; listings take only `where` and `include`:
 *
 *   projects.md — "`/api/projects` for a list of all projects in your company."
 *   tasks.md    — "`/api/tasks?where=project_id=[PROJECT_ID]` for a list of task from a project"
 *   comments.md — "`/api/threads?where=task_id=[TASK_ID]&include=comments` for a list of comments on a task"
 *   users.md    — "`/api/users` for a list of all users in the company."
 *   company.md  — `/api/company` returns one `{ "company": { ... } }` object.
 *
 * Before the fix each list method ignored `page`, so page 2 repeated page 1.
 * Now `pageLocally` slices by `page`/`limit` and reports the total, so
 * `hasMore` is exact.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { PaymoAdapter } from '../../../../../../src/verticals/projects/adapters/paymo/index'

const CREDS = { accessToken: 'paymo-key' }

const L = 3
const N = 2 * L + 1

/** Documented query params per path; anything else (a paging key) is refused. */
const DOCUMENTED: Record<string, string[]> = {
  '/projects': ['where'],
  '/tasks': ['where'],
  '/threads': ['where', 'include'],
  '/users': ['where'],
  '/company': [],
}

function rows(n: number) {
  return Array.from({ length: n }, (_, i) => i + 1)
}

function fakePaymo(n = N) {
  const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
    const allowed = DOCUMENTED[path]
    if (!allowed) throw new Error(`unexpected path ${path}`)
    for (const k of Object.keys(config?.params ?? {})) {
      if (!allowed.includes(k)) throw new Error(`undocumented param ${k} on ${path}`)
    }
    const ids = rows(n)
    switch (path) {
      case '/projects':
        return { data: { projects: ids.map((i) => ({ id: i, name: `P${i}`, active: true })) } }
      case '/tasks':
        return {
          data: {
            tasks: ids.map((i) => ({ id: i, name: `T${i}`, project_id: 7, complete: false })),
          },
        }
      case '/threads': {
        // Comments spread across two threads: the flattened list is the collection.
        const c = ids.map((i) => ({
          id: i,
          content: `c${i}`,
          user_id: 1,
          thread_id: i <= 2 ? 1 : 2,
        }))
        return {
          data: {
            threads: [
              { id: 1, task_id: 9, comments: c.slice(0, 2) },
              { id: 2, task_id: 9, comments: c.slice(2) },
            ],
          },
        }
      }
      case '/users':
        return {
          data: {
            users: ids.map((i) => ({
              id: i,
              name: `User ${i}`,
              email: `u${i}@x.test`,
              active: true,
            })),
          },
        }
      case '/company':
        return { data: { company: { id: 42, name: 'Acme' } } }
    }
    throw new Error('unreachable')
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
  return { get }
}

const adapter = () => new PaymoAdapter()

type Lister = (params: QueryParams) => Promise<{ id: string }[]>
const LISTS: Record<string, Lister> = {
  listProjects: (p) => adapter().listProjects(CREDS, p),
  listTasks: (p) => adapter().listTasks(CREDS, '7', p),
  listComments: (p) => adapter().listComments(CREDS, '9', p),
  listUsers: (p) => adapter().listUsers(CREDS, 'ws', p),
}

const PATH: Record<string, string> = {
  listProjects: '/projects',
  listTasks: '/tasks',
  listComments: '/threads',
  listUsers: '/users',
}

afterEach(() => vi.restoreAllMocks())

describe.each(Object.entries(LISTS))('paymo %s paging', (name, list) => {
  it('requests only its documented endpoint', async () => {
    const { get } = fakePaymo()
    await list(withPageSink({ page: 2, limit: L }))
    expect(get).toHaveBeenCalled()
    for (const [path] of get.mock.calls) expect(path).toBe(PATH[name])
  })

  it('walks pages 1..3 at limit L and yields every row once, in order, with exact hasMore', async () => {
    fakePaymo()
    const seen: string[] = []
    const expectedHasMore = [true, true, false]
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      const got = (await list(params)).map((r) => r.id)
      expect(got.length).toBe(k < 3 ? L : 1)
      seen.push(...got)
      expect(readUpstreamPage(params)).toMatchObject({
        hasMore: expectedHasMore[k - 1],
        totalCount: N,
        pagedLocally: true,
      })
    }
    expect(seen).toEqual(rows(N).map(String))
  })

  it('page 2 sends no paging parameter upstream (none is documented) and differs from page 1', async () => {
    const { get } = fakePaymo()
    const p1 = (await list(withPageSink({ page: 1, limit: L }))).map((r) => r.id)
    const p2 = (await list(withPageSink({ page: 2, limit: L }))).map((r) => r.id)
    expect(p2).not.toEqual(p1)
    for (const [, config] of get.mock.calls) {
      const keys = Object.keys((config as { params?: object } | undefined)?.params ?? {})
      expect(keys).not.toContain('page')
      expect(keys).not.toContain('limit')
      expect(keys).not.toContain('offset')
    }
  })

  it('a limit above the collection size returns everything and reports the end', async () => {
    fakePaymo()
    const params = withPageSink({ page: 1, limit: 500 })
    expect((await list(params)).length).toBe(N)
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: false, totalCount: N })
  })

  it('API path: parseListQuery + listPage report exact meta', async () => {
    fakePaymo()
    const p2 = withPageSink(parseListQuery({ page: '2', limit: String(L) }))
    const env2 = listPage(await list(p2), p2, 'paymo')
    expect(env2.data.map((r) => r.id)).toEqual(['4', '5', '6'])
    expect(env2.meta).toMatchObject({ page: 2, hasMore: true, totalCount: N })

    const p3 = withPageSink(parseListQuery({ page: '3', limit: String(L) }))
    const env3 = listPage(await list(p3), p3, 'paymo')
    expect(env3.data.map((r) => r.id)).toEqual(['7'])
    expect(env3.meta).toMatchObject({ page: 3, hasMore: false, totalCount: N })
  })
})

describe('paymo listWorkspaces paging (one company = one workspace)', () => {
  it('page 1 has the workspace, page 2 is empty, hasMore false', async () => {
    fakePaymo()
    const p1 = withPageSink({ page: 1, limit: 1 })
    expect((await adapter().listWorkspaces(CREDS, p1)).map((w) => w.id)).toEqual(['42'])
    expect(readUpstreamPage(p1)).toMatchObject({
      hasMore: false,
      totalCount: 1,
      pagedLocally: true,
    })

    const p2 = withPageSink({ page: 2, limit: 1 })
    expect(await adapter().listWorkspaces(CREDS, p2)).toEqual([])
    expect(readUpstreamPage(p2)).toMatchObject({ hasMore: false, totalCount: 1 })
  })

  it('API path: parseListQuery + listPage', async () => {
    fakePaymo()
    const p = withPageSink(parseListQuery({ page: '2', limit: '10' }))
    const env = listPage(await adapter().listWorkspaces(CREDS, p), p, 'paymo')
    expect(env.data).toEqual([])
    expect(env.meta).toMatchObject({ page: 2, hasMore: false, totalCount: 1 })
  })
})

describe('paymo scoped lists send the caller scope as the documented where filter', () => {
  it('listTasks filters by the given project id on every page', async () => {
    const { get } = fakePaymo()
    await adapter().listTasks(CREDS, '7', withPageSink({ page: 2, limit: L }))
    expect(get.mock.calls.length).toBeGreaterThan(0)
    for (const [, config] of get.mock.calls) {
      expect(config?.params?.where).toBe('project_id=7')
    }
  })

  it('listComments filters threads by the given task id and includes comments', async () => {
    const { get } = fakePaymo()
    await adapter().listComments(CREDS, '9', withPageSink({ page: 2, limit: L }))
    expect(get.mock.calls.length).toBeGreaterThan(0)
    for (const [, config] of get.mock.calls) {
      expect(config?.params).toMatchObject({ where: 'task_id=9', include: 'comments' })
    }
  })
})

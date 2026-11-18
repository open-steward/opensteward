/**
 * Taiga listUsers: the members of one project, from GET /memberships?project=N.
 *
 * https://docs.taiga.io/api.html#memberships-list:
 *   "To list memberships send a GET request with the following parameters:"
 *   "The HTTP response is a 200 OK and the response body is a JSON list of
 *    membership detail objects"
 *   "The results can be filtered using the following parameters:
 *    project: project id  role: role id"
 *
 * Paging (https://docs.taiga.io/api.html#_pagination): "By default the API will
 * always return paginated results", "x-pagination-next: next results". The
 * `page` / `page_size` names and the 1000 cutoff are taiga-back's
 * (taiga/base/api/pagination.py, settings/common.py).
 *
 * A membership whose `user` is null is a pending invitation (taiga-back
 * projects/models.py: "stores invitations to memberships that does not have
 * assigned user"), not a user, so it is not served.
 *
 * The fake honours only `project`, `page`, `page_size` (default 30, cut off at
 * 1000), `x-pagination-next`, and 404 past the last page.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { readUpstreamPage, withPageSink } from '@opensteward/shared'
import { TaigaAdapter } from '../../../../../../src/verticals/projects/adapters/taiga/index'
import { UserSchema } from '../../../../../../src/verticals/projects/schema/user'

let tokenSeq = 0
const creds = () => ({ accessToken: `taiga-users-${++tokenSeq}-${Date.now()}` })

type Row = Record<string, unknown>
interface Call {
  path: string
  params: Record<string, unknown>
}

function notFound(): never {
  throw Object.assign(new Error('Request failed with status code 404'), {
    isAxiosError: true,
    response: { status: 404, data: { _error_message: 'Invalid page' } },
  })
}

/** Memberships per project id; only documented params are honoured. */
function fakeTaiga(byProject: Record<string, Row[]>) {
  const calls: Call[] = []
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    const params = cfg?.params ?? {}
    calls.push({ path, params })
    if (path !== '/memberships') throw new Error(`unexpected path ${path}`)
    const project = params['project']
    const rows =
      project === undefined ? Object.values(byProject).flat() : (byProject[String(project)] ?? [])
    const asked = Number(params['page_size'])
    const size = Number.isInteger(asked) && asked > 0 ? Math.min(asked, 1000) : 30
    const page = params['page'] === undefined ? 1 : Number(params['page'])
    const start = (page - 1) * size
    if (page > 1 && start >= rows.length) notFound()
    const headers: Record<string, string> = { 'x-pagination-count': String(rows.length) }
    if (start + size < rows.length) {
      headers['x-pagination-next'] = `https://api.taiga.io/api/v1/memberships?page=${page + 1}`
    }
    return { data: rows.slice(start, start + size), headers }
  })
  vi.spyOn(axios, 'create').mockImplementation((() => ({ get })) as never)
  return { calls, get }
}

/** Shaped on the documented "Membership detail" example (docs.taiga.io/api.html). */
function membership(id: number, user: number | null, project = 1): Row {
  return {
    color: '#002e33',
    created_at: '2020-07-02T11:56:20.444Z',
    email: `user${id}@taigaio.demo`,
    full_name: user === null ? null : `Member ${id}`,
    gravatar_id: 'dce0e8ed702cd85d5132e523121e619b',
    id,
    invitation_extra_text: null,
    invited_by: null,
    is_admin: true,
    is_owner: false,
    is_user_active: user !== null,
    photo: null,
    project,
    project_name: 'Project Example 0',
    project_slug: 'project-0',
    role: 5,
    role_name: 'Product Owner',
    user,
    user_email: user === null ? null : `user${id}@taigaio.demo`,
    user_order: 6,
  }
}

const members = (n: number, project = 1) =>
  Array.from({ length: n }, (_, i) => membership(100 + i, 10 + i, project))

afterEach(() => vi.restoreAllMocks())

describe('taiga listUsers (GET /memberships?project=N)', () => {
  const L = 3
  const N = 2 * L + 1

  it('asks /memberships for the project at the caller page and page_size', async () => {
    const { calls } = fakeTaiga({ '7': members(N, 7) })
    await new TaigaAdapter().listUsers(creds(), '7', withPageSink({ page: 2, limit: L }))
    expect(calls).toEqual([
      { path: '/memberships', params: { page: 2, page_size: L, project: '7' } },
    ])
  })

  it('walks pages 1..3 serving every member once, in order, with hasMore exact', async () => {
    fakeTaiga({ '1': members(N), '2': members(4, 2).map((m) => ({ ...m, user: 999 })) })
    const c = creds()
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      const got = await new TaigaAdapter().listUsers(c, '1', params)
      for (const u of got) UserSchema.parse(u)
      seen.push(...got.map((u) => u.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(members(N).map((m) => String(m.user)))
    expect(new Set(seen).size).toBe(N)
    expect(more).toEqual([true, true, false])
  })

  it('skips pending invitations (user null) without losing a page', async () => {
    const rows = [membership(1, 11), membership(2, null), membership(3, 13), membership(4, 14)]
    fakeTaiga({ '1': rows })
    const c = creds()
    const p1 = withPageSink({ page: 1, limit: 2 })
    const p2 = withPageSink({ page: 2, limit: 2 })
    const a = await new TaigaAdapter().listUsers(c, '1', p1)
    const b = await new TaigaAdapter().listUsers(c, '1', p2)
    expect(a.map((u) => u.id)).toEqual(['11'])
    expect(readUpstreamPage(p1)?.hasMore).toBe(true)
    expect(b.map((u) => u.id)).toEqual(['13', '14'])
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
  })

  it('a limit above the 1000 cutoff sends page_size=1000 and reports it', async () => {
    const { calls } = fakeTaiga({ '1': members(1200) })
    const params = withPageSink({ page: 1, limit: 1500 })
    const got = await new TaigaAdapter().listUsers(creds(), '1', params)
    expect(calls[0]!.params['page_size']).toBe(1000)
    expect(got).toHaveLength(1000)
    expect(readUpstreamPage(params)).toMatchObject({ pageSize: 1000, hasMore: true })
  })

  it('reports no totalCount: x-pagination-count counts pending invitations too', async () => {
    fakeTaiga({ '1': [membership(1, 11), membership(2, null), membership(3, 13)] })
    const params = withPageSink({ page: 1, limit: 3 })
    const got = await new TaigaAdapter().listUsers(creds(), '1', params)
    expect(got).toHaveLength(2)
    expect(readUpstreamPage(params)?.totalCount).toBeUndefined()
  })

  it('reports no pageSize when the caller limit was sent unclamped', async () => {
    fakeTaiga({ '1': members(N) })
    const params = withPageSink({ page: 1, limit: L })
    await new TaigaAdapter().listUsers(creds(), '1', params)
    expect(readUpstreamPage(params)).toEqual({ hasMore: true })
  })

  it('a page past the end is empty with hasMore=false', async () => {
    fakeTaiga({ '1': members(2) })
    const params = withPageSink({ page: 3, limit: 2 })
    expect(await new TaigaAdapter().listUsers(creds(), '1', params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })
})

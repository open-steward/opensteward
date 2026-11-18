/**
 * Nifty v1.0 pages its list endpoints by `limit` + `offset` and answers with a
 * more flag. From the v1.0 OpenAPI document the developer portal serves
 * (https://developers.niftypm.com/docs/api/v1.0/1.0/nifty-v1-openapi.json,
 * `info.description`):
 *
 *   "**Pagination.** List operations take `limit` (default `25`) and `offset`,
 *   and answer with `hasMore`. `hasMore` is true whenever the page came back
 *   full, so a final page that happens to be exactly `limit` long also reports
 *   true — fetch the next page to confirm you are done."
 *
 * Per endpoint:
 *   - GET /api/v1.0/tasks: `limit` "Page size. There is no server maximum;
 *     keep it at or below 100.", `offset` "Record Offset"; `{ tasks, hasMore }`.
 *   - GET /api/v1.0/messages: `limit` "No of records per page", `offset`
 *     "Record Offset"; `{ messages, has_more }`.
 *   - GET /api/v1.0/labels: `limit` "No of records per page", `offset`
 *     "Record Offset"; `{ hasMore, items }`.
 *   - GET /api/v1.0/members: "The { items, hasMore } envelope shown below is
 *     returned only when BOTH limit and offset are sent; without them the
 *     response is a bare array of members."
 *
 * The adapter sends `offset = (page - 1) × size` with the caller's limit
 * clamped to 100 (the tasks guidance, applied to every list), reports that
 * size when it clamps, and reports the documented more flag.
 *
 * listProjects and listWorkspaces (envelopes `{ projects, hasMore }` and
 * `{ subteams, items: boolean, hasMore }`) are covered in
 * projects-workspaces.test.ts.
 *
 * Every list used to send `limit` and read an offset only from
 * `params.cursor`, so caller page 2 repeated page 1. The fake honours ONLY
 * the documented paging inputs.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { NiftyAdapter } from '../../../../../../src/verticals/projects/adapters/nifty/index'

vi.mock('axios')

const C1: Credentials = { accessToken: 'tok-1' }
const C2: Credentials = { accessToken: 'tok-2' }

/** Documented default of `limit`. */
const NIFTY_DEFAULT = 25

interface Req {
  token: string
  path: string
  params: Record<string, unknown>
}

type Kind = 'tasks' | 'messages' | 'labels' | 'members'

function id(token: string, parent: string, n: number): string {
  return `${token}-${parent}-${String(n).padStart(5, '0')}`
}

function row(kind: Kind, token: string, parent: string, n: number): Record<string, unknown> {
  const rid = id(token, parent, n)
  const at = new Date(Date.UTC(2024, 0, 1) + n * 1000).toISOString()
  switch (kind) {
    case 'tasks':
      return { id: rid, name: `task ${rid}`, project: parent, created_at: at, updated_at: at }
    case 'messages':
      return { id: rid, text: `msg ${rid}`, task: parent, created_at: at }
    case 'labels':
      return { id: rid, name: `label ${rid}` }
    case 'members':
      return { id: rid, name: `member ${rid}`, email: `${rid}@example.com` }
  }
}

function num(raw: unknown, fallback: number): number {
  if (raw === undefined) return fallback
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 0) throw new Error(`invalid paging value ${String(raw)}`)
  return n
}

interface FakeOpts {
  /** Overrides the more flag: `undefined` omits it from the envelope. */
  flag?: (full: boolean) => boolean | undefined
  /** Row numbers served with `is_deleted: true` (messages only). */
  deleted?: (n: number) => boolean
}

/**
 * One Nifty list endpoint holding `total` rows per (token, parent). Honours
 * only `limit` (default 25, no server maximum) and `offset`, and answers with
 * the documented envelope: by default the more flag is true whenever the page
 * is full. `opts.flag` makes it disagree with fullness or omits it.
 */
function fakeNifty(kind: Kind, total: number, requests: Req[] = [], opts: FakeOpts = {}) {
  vi.mocked(axios.create).mockImplementation(((config?: { headers?: Record<string, unknown> }) => {
    const token = String(config?.headers?.['Authorization'] ?? '').replace(/^Bearer /, '')
    const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
      const params = { ...(cfg?.params ?? {}) }
      requests.push({ token, path, params })
      if (path !== `/${kind}`) throw new Error(`unexpected path ${path}`)
      const parent =
        kind === 'tasks'
          ? String(params['project_id'])
          : kind === 'messages'
            ? String(params['task_id'])
            : 'all'
      const all = Array.from({ length: total }, (_, i) => {
        const r = row(kind, token, parent, i)
        return opts.deleted?.(i) ? { ...r, is_deleted: true } : r
      })
      if (kind === 'members' && (params['limit'] === undefined || params['offset'] === undefined)) {
        return { data: all }
      }
      const lim = num(params['limit'], NIFTY_DEFAULT)
      if (lim < 1) throw new Error('limit must be >= 1')
      const off = num(params['offset'], 0)
      const page = all.slice(off, off + lim)
      const full = page.length === lim
      const flag = opts.flag ? opts.flag(full) : full
      const more = (key: string) => (flag === undefined ? {} : { [key]: flag })
      switch (kind) {
        case 'tasks':
          return { data: { tasks: page, ...more('hasMore') } }
        case 'messages':
          return { data: { messages: page, ...more('has_more') } }
        case 'labels':
        case 'members':
          return { data: { items: page, ...more('hasMore') } }
      }
    })
    return { get }
  }) as unknown as typeof axios.create)
  return { requests }
}

type Lister = (
  a: NiftyAdapter,
  c: Credentials,
  parent: string,
  p: QueryParams,
) => Promise<{ id: string }[]>

const LISTS: Array<[string, Kind, Lister]> = [
  ['listTasks', 'tasks', (a, c, parent, p) => a.listTasks(c, parent, p)],
  ['listComments', 'messages', (a, c, parent, p) => a.listComments(c, parent, p)],
  ['listTags', 'labels', (a, c, parent, p) => a.listTags(c, parent, p)],
  ['listUsers', 'members', (a, c, parent, p) => a.listUsers(c, parent, p)],
]

function parentOf(kind: Kind, parent: string): string {
  return kind === 'tasks' || kind === 'messages' ? parent : 'all'
}

function ids(kind: Kind, token: string, parent: string, from: number, n: number): string[] {
  return Array.from({ length: n }, (_, i) => id(token, parentOf(kind, parent), from + i))
}

function adapter(): NiftyAdapter {
  return new NiftyAdapter({ clientId: 'c', clientSecret: 's', redirectUri: 'https://x/cb' })
}

afterEach(() => vi.clearAllMocks())

describe.each(LISTS)('nifty %s pages at the caller size', (_name, kind, list) => {
  it('N = 2L+1 rows at limit L: pages 1-3 serve every id once, in order, hasMore exact', async () => {
    const L = 40
    fakeNifty(kind, 2 * L + 1)
    const a = adapter()
    const served: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await list(a, C1, 'p1', params)
      served.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(served).toEqual(ids(kind, 'tok-1', 'p1', 0, 2 * L + 1))
    expect(more).toEqual([true, true, false])
  })

  it('page 2 is fetched with offset = L and limit = L', async () => {
    const L = 40
    const { requests } = fakeNifty(kind, 2 * L + 1)
    await list(adapter(), C1, 'p1', withPageSink({ page: 2, limit: L }))
    expect(requests).toHaveLength(1)
    expect(requests[0]!.params['offset']).toBe(L)
    expect(requests[0]!.params['limit']).toBe(L)
  })

  it('a limit above 100 is sent as 100 and reported as the page size', async () => {
    const { requests } = fakeNifty(kind, 450)
    const a = adapter()
    const p1 = withPageSink({ page: 1, limit: 250 })
    const r1 = await list(a, C1, 'p1', p1)
    const p2 = withPageSink({ page: 2, limit: 250 })
    const r2 = await list(a, C1, 'p1', p2)
    expect(requests.map((r) => r.params['limit'])).toEqual([100, 100])
    expect(requests.map((r) => r.params['offset'])).toEqual([0, 100])
    expect(readUpstreamPage(p1)?.pageSize).toBe(100)
    expect(r1.map((r) => r.id)).toEqual(ids(kind, 'tok-1', 'p1', 0, 100))
    expect(r2.map((r) => r.id)).toEqual(ids(kind, 'tok-1', 'p1', 100, 100))
  })

  it('API path: parseListQuery + listPage walks the whole collection once', async () => {
    fakeNifty(kind, 230)
    const a = adapter()
    const served: string[] = []
    for (let page = 1; page < 20; page++) {
      const params = parseListQuery({ limit: '25', page: String(page) })
      const env = listPage(await list(a, C1, 'p1', params), params, 'nifty')
      served.push(...env.data.map((r) => r.id))
      if (env.meta.hasMore !== true) break
    }
    expect(served).toEqual(ids(kind, 'tok-1', 'p1', 0, 230))
  })

  it('two connections interleaved each walk their own rows', async () => {
    const L = 40
    fakeNifty(kind, 2 * L + 1)
    const a = adapter()
    const a1 = await list(a, C1, 'p1', withPageSink({ page: 1, limit: L }))
    const b2 = await list(a, C2, 'p1', withPageSink({ page: 2, limit: L }))
    const a2 = await list(a, C1, 'p1', withPageSink({ page: 2, limit: L }))
    expect(a1.map((r) => r.id)).toEqual(ids(kind, 'tok-1', 'p1', 0, L))
    expect(b2.map((r) => r.id)).toEqual(ids(kind, 'tok-2', 'p1', L, L))
    expect(a2.map((r) => r.id)).toEqual(ids(kind, 'tok-1', 'p1', L, L))
  })

  it('the upstream flag decides when it disagrees with fullness', async () => {
    // The flag rides on this kind's documented key (hasMore / has_more). A
    // full page flagged false and a short page flagged true are reported as sent.
    const L = 40
    fakeNifty(kind, 2 * L, [], { flag: (full) => !full })
    const a = adapter()
    const p1 = withPageSink({ page: 1, limit: L })
    await list(a, C1, 'p1', p1)
    const p3 = withPageSink({ page: 3, limit: L })
    await list(a, C1, 'p1', p3)
    expect(readUpstreamPage(p1)?.hasMore).toBe(false)
    expect(readUpstreamPage(p3)?.hasMore).toBe(true)
  })

  it('with no flag in the envelope, a full page reads as more and a short one as the end', async () => {
    const L = 40
    fakeNifty(kind, L + 1, [], { flag: () => undefined })
    const a = adapter()
    const p1 = withPageSink({ page: 1, limit: L })
    await list(a, C1, 'p1', p1)
    const p2 = withPageSink({ page: 2, limit: L })
    await list(a, C1, 'p1', p2)
    expect(readUpstreamPage(p1)?.hasMore).toBe(true)
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
  })
})

describe('nifty listComments judges the page before dropping deleted messages', () => {
  const L = 40
  const deleted = (n: number) => n % 4 === 0

  it.each([
    ['no flag', () => undefined],
    ['has_more sent', (full: boolean) => full],
  ] as const)(
    '%s: a full page with deleted rows still reads as more and page 2 follows',
    async (_l, flag) => {
      fakeNifty('messages', 2 * L + 1, [], { flag, deleted })
      const a = adapter()
      const served: string[] = []
      const more: Array<boolean | undefined> = []
      for (let page = 1; page <= 3; page++) {
        const params = withPageSink({ page, limit: L })
        const rows = await a.listComments(C1, 't1', params)
        served.push(...rows.map((r) => r.id))
        more.push(readUpstreamPage(params)?.hasMore)
      }
      const live = Array.from({ length: 2 * L + 1 }, (_, n) => n).filter((n) => !deleted(n))
      expect(served).toEqual(live.map((n) => id('tok-1', 't1', n)))
      expect(more).toEqual([true, true, false])
    },
  )
})

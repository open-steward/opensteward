/**
 * Quickbase paging (https://developer.quickbase.com/).
 *
 * listTasks → POST /records/query pages by `options.skip` / `options.top`.
 * Responses use "intelligent pagination": "some requests may not include the
 * entire requested response size", and "numRecords can be compared to
 * totalRecords to determine if further pagination is needed". The adapter
 * used to send skip 0 on every page, so page 2 repeated page 1.
 *
 * listUsers → POST /users pages by a `nextPageToken` in the body, returned
 * under `metadata.nextPageToken`; "The count of the returned users may vary"
 * and there is no page-size parameter. The adapter used to send `{}` on every
 * page.
 *
 * The fakes honour ONLY those documented parameters.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import {
  withPageSink,
  readUpstreamPage,
  _resetRowPager,
  parseListQuery,
  listPage,
} from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { QuickbaseAdapter } from '../../../../../../src/verticals/projects/adapters/quickbase/index'

vi.mock('axios')

const C1: Credentials = { accessToken: 'tok', extra: { realmHostname: 'acme.quickbase.com' } }
const C2: Credentials = { accessToken: 'tok2', extra: { realmHostname: 'acme.quickbase.com' } }

/** Quickbase's "dynamic maximum": no response carries more records than this. */
const DYNAMIC_MAX = 7
/** Users per /users response ("The count of the returned users may vary"). */
const USERS_PER_PAGE = 4

interface Req {
  token: string
  path: string
  body: Record<string, unknown>
}

function recordId(n: number): string {
  return String(1000 + n)
}

function userHash(token: string, n: number): string {
  return `${token}.${String(n).padStart(4, '0')}.xc1`
}

/** One Quickbase realm: `records` rows in table `bt1`, `users` users per token. */
function fakeQuickbase(
  opts: { records?: number; users?: number; emptyFromSkip?: number },
  requests: Req[] = [],
) {
  const tokens = new Map<string, string>() // nextPageToken → `${token}:${offset}`
  let minted = 0
  vi.mocked(axios.create).mockImplementation(((config?: { headers?: Record<string, unknown> }) => {
    const token = String(config?.headers?.['Authorization'] ?? '').replace(/^QB-USER-TOKEN /, '')
    const post = vi.fn(async (path: string, body: Record<string, unknown> = {}) => {
      requests.push({ token, path, body: JSON.parse(JSON.stringify(body)) })
      if (path === '/records/query') {
        if (body['from'] !== 'bt1') throw new Error(`unknown table ${String(body['from'])}`)
        const total = opts.records ?? 0
        const options = (body['options'] ?? {}) as { skip?: number; top?: number }
        const skip = options.skip ?? 0
        const top = options.top ?? 100
        const empty = opts.emptyFromSkip !== undefined && skip >= opts.emptyFromSkip
        const n = empty ? 0 : Math.max(0, Math.min(top, DYNAMIC_MAX, total - skip))
        return {
          data: {
            data: Array.from({ length: n }, (_, i) => ({
              '3': { value: Number(recordId(skip + i)) },
            })),
            fields: [{ id: 3, label: 'Record ID#', type: 'recordid' }],
            metadata: { totalRecords: total, numRecords: n, numFields: 1, skip, top },
          },
        }
      }
      if (path === '/users') {
        const emails = body['emails'] as string[] | undefined
        const all = Array.from({ length: opts.users ?? 0 }, (_, i) => i).filter(
          (i) => !emails || emails.includes(`u${i}@example.com`),
        )
        const total = all.length
        let start = 0
        const sent = body['nextPageToken']
        if (sent) {
          const pos = tokens.get(String(sent))
          if (!pos) throw new Error(`unknown nextPageToken ${String(sent)}`)
          const [owner, off] = pos.split(':')
          if (owner !== token) throw new Error('nextPageToken minted for another user')
          start = Number(off)
        }
        const n = Math.max(0, Math.min(USERS_PER_PAGE, total - start))
        let next = ''
        if (start + n < total) {
          next = `npt${++minted}`
          tokens.set(next, `${token}:${start + n}`)
        }
        return {
          data: {
            users: all.slice(start, start + n).map((u) => ({
              userName: `u${u}`,
              firstName: 'F',
              lastName: 'L',
              emailAddress: `u${u}@example.com`,
              hashId: userHash(token, u),
            })),
            metadata: { nextPageToken: next },
          },
        }
      }
      throw new Error(`unexpected path ${path}`)
    })
    return { post, get: vi.fn() }
  }) as unknown as typeof axios.create)
  return { requests }
}

function taskIds(from: number, n: number): string[] {
  return Array.from({ length: n }, (_, i) => recordId(from + i))
}

function userHashes(token: string, from: number, n: number): string[] {
  return Array.from({ length: n }, (_, i) => userHash(token, from + i))
}

function hashOf(u: { raw?: unknown }): string {
  return String((u.raw as Record<string, unknown>)['hashId'])
}

beforeEach(() => _resetRowPager())
afterEach(() => vi.clearAllMocks())

describe('quickbase listTasks paging (options.skip / options.top)', () => {
  it('pages 1..3 of 2L+1 records serve every id once, in order, with hasMore exact', async () => {
    const L = 5
    fakeQuickbase({ records: 2 * L + 1 })
    const adapter = new QuickbaseAdapter()
    const served: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listTasks(C1, 'bt1', params)
      served.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(served).toEqual(taskIds(0, 2 * L + 1))
    expect(more).toEqual([true, true, false])
  })

  it('a collection ending exactly on a page boundary reports hasMore false on the last page, with totalCount', async () => {
    const L = 5
    fakeQuickbase({ records: 2 * L })
    const adapter = new QuickbaseAdapter()
    const more: Array<boolean | undefined> = []
    const totals: Array<number | undefined> = []
    for (const page of [1, 2]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listTasks(C1, 'bt1', params)
      expect(rows.map((r) => r.id)).toEqual(taskIds((page - 1) * L, L))
      more.push(readUpstreamPage(params)?.hasMore)
      totals.push(readUpstreamPage(params)?.totalCount)
    }
    expect(more).toEqual([true, false])
    expect(totals).toEqual([2 * L, 2 * L])
  })

  it('an explicit cursor is a raw skip and overrides the page offset', async () => {
    const { requests } = fakeQuickbase({ records: 20 })
    const params = withPageSink({ page: 1, limit: 4 })
    params['cursor'] = '9'
    const rows = await new QuickbaseAdapter().listTasks(C1, 'bt1', params)
    expect(requests[0]!.body['options']).toEqual({ skip: 9, top: 4 })
    expect(rows.map((r) => r.id)).toEqual(taskIds(9, 4))
  })

  it('an empty response before totalRecords stops the fill loop instead of re-asking', async () => {
    const { requests } = fakeQuickbase({ records: 30, emptyFromSkip: DYNAMIC_MAX })
    const params = withPageSink({ page: 1, limit: 20 })
    const rows = await new QuickbaseAdapter().listTasks(C1, 'bt1', params)
    expect(rows.map((r) => r.id)).toEqual(taskIds(0, DYNAMIC_MAX))
    expect(requests).toHaveLength(2)
  })

  it('the page-2 request carries options.skip = limit', async () => {
    const { requests } = fakeQuickbase({ records: 20 })
    await new QuickbaseAdapter().listTasks(C1, 'bt1', withPageSink({ page: 2, limit: 5 }))
    expect(requests).toHaveLength(1)
    expect(requests[0]!.body['options']).toEqual({ skip: 5, top: 5 })
  })

  it('a limit above the dynamic maximum is filled from skip + numRecords, never skipping rows', async () => {
    const L = 3 * DYNAMIC_MAX + 2
    const { requests } = fakeQuickbase({ records: 2 * L + 1 })
    const adapter = new QuickbaseAdapter()
    const served: string[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listTasks(C1, 'bt1', params)
      expect(rows.length).toBe(page < 3 ? L : 1)
      served.push(...rows.map((r) => r.id))
    }
    expect(served).toEqual(taskIds(0, 2 * L + 1))
    // Page 2 starts at L, and its continuation requests follow on from each short response.
    const page2 = requests.filter((r) => {
      const o = r.body['options'] as { skip: number }
      return o.skip >= L && o.skip < 2 * L
    })
    expect(page2.map((r) => (r.body['options'] as { skip: number }).skip)).toEqual([
      L,
      L + 7,
      L + 14,
      L + 21,
    ])
  })

  it('API path: parseListQuery + listPage walks the whole table once', async () => {
    fakeQuickbase({ records: 23 })
    const adapter = new QuickbaseAdapter()
    const served: string[] = []
    for (let page = 1; page < 20; page++) {
      const params = parseListQuery({ limit: '4', page: String(page) })
      const env = listPage(await adapter.listTasks(C1, 'bt1', params), params, 'quickbase')
      served.push(...env.data.map((r) => r.id))
      if (env.meta.hasMore !== true) break
    }
    expect(served).toEqual(taskIds(0, 23))
  })
})

describe('quickbase listUsers paging (nextPageToken)', () => {
  it('pages 1..3 of 2L+1 users serve every user once, in order, with hasMore exact', async () => {
    const L = 5
    fakeQuickbase({ users: 2 * L + 1 })
    const adapter = new QuickbaseAdapter()
    const served: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listUsers(C1, 'app1', params)
      served.push(...rows.map(hashOf))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(served).toEqual(userHashes('tok', 0, 2 * L + 1))
    expect(more).toEqual([true, true, false])
  })

  it('the page-2 request carries the documented nextPageToken', async () => {
    const { requests } = fakeQuickbase({ users: 20 })
    const adapter = new QuickbaseAdapter()
    await adapter.listUsers(C1, 'app1', withPageSink({ page: 1, limit: USERS_PER_PAGE }))
    requests.length = 0
    await adapter.listUsers(C1, 'app1', withPageSink({ page: 2, limit: USERS_PER_PAGE }))
    expect(requests.some((r) => typeof r.body['nextPageToken'] === 'string')).toBe(true)
  })

  it('a limit above what one response holds is cut from several upstream pages', async () => {
    fakeQuickbase({ users: 30 })
    const params = withPageSink({ page: 1, limit: 10 })
    const rows = await new QuickbaseAdapter().listUsers(C1, 'app1', params)
    expect(rows.map(hashOf)).toEqual(userHashes('tok', 0, 10))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('an emails filter is sent upstream and never shares a walk with the unfiltered list', async () => {
    const { requests } = fakeQuickbase({ users: 12 })
    const adapter = new QuickbaseAdapter()
    const emails = ['u2@example.com', 'u5@example.com', 'u6@example.com', 'u9@example.com']
    const all1 = await adapter.listUsers(C1, 'app1', withPageSink({ page: 1, limit: 2 }))
    expect(all1.map(hashOf)).toEqual(userHashes('tok', 0, 2))
    requests.length = 0
    const f2 = await adapter.listUsers(
      C1,
      'app1',
      Object.assign(withPageSink({ page: 2, limit: 2 }), { emails }),
    )
    expect(f2.map(hashOf)).toEqual([userHash('tok', 6), userHash('tok', 9)])
    expect(requests.length).toBeGreaterThan(0)
    for (const r of requests) expect(r.body['emails']).toEqual(emails)
  })

  it('an explicit next_page_token serves exactly that one upstream page', async () => {
    const { requests } = fakeQuickbase({ users: 20 })
    const adapter = new QuickbaseAdapter()
    // The first upstream response mints npt1, which points at offset USERS_PER_PAGE.
    await adapter.listUsers(C1, 'app1', withPageSink({ page: 1, limit: USERS_PER_PAGE }))
    requests.length = 0
    const rows = await adapter.listUsers(
      C1,
      'app1',
      Object.assign(withPageSink({ page: 1, limit: 50 }), { next_page_token: 'npt1' }),
    )
    expect(requests).toHaveLength(1)
    expect(requests[0]!.body['nextPageToken']).toBe('npt1')
    expect(rows.map(hashOf)).toEqual(userHashes('tok', USERS_PER_PAGE, USERS_PER_PAGE))
  })

  it('two connections interleaved within the TTL each walk their own users', async () => {
    fakeQuickbase({ users: 9 })
    const adapter = new QuickbaseAdapter()
    const a1 = await adapter.listUsers(C1, 'app1', withPageSink({ page: 1, limit: 3 }))
    const b2 = await adapter.listUsers(C2, 'app1', withPageSink({ page: 2, limit: 3 }))
    const a2 = await adapter.listUsers(C1, 'app1', withPageSink({ page: 2, limit: 3 }))
    expect(a1.map(hashOf)).toEqual(userHashes('tok', 0, 3))
    expect(b2.map(hashOf)).toEqual(userHashes('tok2', 3, 3))
    expect(a2.map(hashOf)).toEqual(userHashes('tok', 3, 3))
  })

  it('API path: parseListQuery + listPage walks every user once', async () => {
    fakeQuickbase({ users: 17 })
    const adapter = new QuickbaseAdapter()
    const served: string[] = []
    for (let page = 1; page < 20; page++) {
      const params = parseListQuery({ limit: '5', page: String(page) })
      const env = listPage(await adapter.listUsers(C1, 'app1', params), params, 'quickbase')
      served.push(...env.data.map(hashOf))
      if (env.meta.hasMore !== true) break
    }
    expect(served).toEqual(userHashes('tok', 0, 17))
  })
})

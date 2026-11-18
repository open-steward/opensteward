/**
 * Recruit CRM activities and pipelines.
 *
 * The API reference (Stoplight, docs.recruitcrm.io) has no activities
 * resource. It documents three activity collections, each a page/limit list
 * ("Page Number for Pagination", "Limit of records per page. (Max:100)") in a
 * Laravel envelope whose `next_page_url` is null on the last page:
 * GET /v1/tasks, GET /v1/meetings and GET /v1/call-logs, with find-by-ID at
 * /v1/tasks/{task}, /v1/meetings/{meeting} and /v1/call-logs/{call_log}.
 *
 * For pipelines it documents only GET /v1/deals-pipeline, which "Returns a
 * list of stages in deals pipeline" (id, label, percentage) and names no
 * pipeline, so listPipelines refuses.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { readUpstreamPage, withPageSink } from '@opensteward/shared'
import { ActivitySchema } from '../../../../../../src/verticals/crm/schema/activity'
import { RecruitCrmAdapter } from '../../../../../../src/verticals/crm/adapters/recruit-crm/index'

const MAX = 100
const PATHS = ['tasks', 'meetings', 'call-logs'] as const
type Path = (typeof PATHS)[number]

let tokenSeq = 0
/** A fresh token per test, so the row pager's per-connection memo never leaks between tests. */
function creds() {
  tokenSeq += 1
  return { accessToken: `rcrm_activities_${String(tokenSeq)}` }
}

function row(path: Path, id: number): Record<string, unknown> {
  if (path === 'call-logs') {
    return {
      id,
      call_type: 'CALL_OUTGOING',
      call_notes: `n${String(id)}`,
      created_on: '2022-12-02T17:00:00.000000Z',
    }
  }
  return {
    id,
    title: `${path}-${String(id)}`,
    owner: '10002',
    created_on: '2022-12-02T17:00:00.000000Z',
  }
}

/**
 * A fake Recruit CRM honouring ONLY the documented `page` and `limit` (max 100)
 * on the three documented collections and their find-by-ID paths. Anything
 * else is a 404, as on the real host.
 */
function fakeRecruitCrm(counts: Record<Path, number>) {
  const stores = Object.fromEntries(
    PATHS.map((p) => [p, Array.from({ length: counts[p] }, (_, i) => row(p, i + 1))]),
  ) as Record<Path, Record<string, unknown>[]>
  const sent: URL[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    sent.push(url)
    if ((init?.method ?? 'GET') !== 'GET' || url.host !== 'api.recruitcrm.io') {
      return new Response('unexpected', { status: 404 })
    }
    const one = /^\/v1\/(tasks|meetings|call-logs)\/(\d+)$/.exec(url.pathname)
    if (one) {
      const found = stores[one[1] as Path].find((r) => String(r.id) === one[2])
      return found
        ? Response.json(found)
        : Response.json(
            { error: true, errorCode: '404', errorMessage: 'not found' },
            { status: 404 },
          )
    }
    const list = /^\/v1\/(tasks|meetings|call-logs)$/.exec(url.pathname)
    if (!list) return new Response(`unexpected ${url.pathname}`, { status: 404 })
    for (const k of url.searchParams.keys()) {
      if (k !== 'page' && k !== 'limit') return new Response(`undocumented ${k}`, { status: 400 })
    }
    const page = Number(url.searchParams.get('page') ?? '1')
    const limit = Number(url.searchParams.get('limit') ?? '25')
    if (!Number.isInteger(page) || page < 1) return new Response('bad page', { status: 400 })
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX)
      return new Response('bad limit', { status: 400 })
    const store = stores[list[1] as Path]
    const from = (page - 1) * limit
    const data = store.slice(from, from + limit)
    const base = `https://api.recruitcrm.io/v1/${list[1]!}`
    return Response.json({
      current_page: page,
      per_page: limit,
      from: data.length ? from + 1 : null,
      to: data.length ? from + data.length : null,
      path: base,
      first_page_url: `${base}?page=1`,
      next_page_url: from + limit < store.length ? `${base}?page=${String(page + 1)}` : null,
      prev_page_url: page > 1 ? `${base}?page=${String(page - 1)}` : null,
      data,
    })
  })
  const ids = PATHS.flatMap((p) =>
    stores[p].map((r) => `${p === 'call-logs' ? 'call-log' : p.slice(0, -1)}_${String(r.id)}`),
  )
  return { ids, sent }
}

afterEach(() => {
  vi.restoreAllMocks()
})

async function walk(c: { accessToken: string }, L: number, pages: number) {
  const seen: string[] = []
  const more: (boolean | undefined)[] = []
  for (let k = 1; k <= pages; k++) {
    const params = withPageSink({ page: k, limit: L })
    const rows = await new RecruitCrmAdapter().listActivities(c, params)
    for (const r of rows) ActivitySchema.parse(r)
    seen.push(...rows.map((r) => r.id))
    more.push(readUpstreamPage(params)?.hasMore)
  }
  return { seen, more }
}

describe('recruit-crm listActivities', () => {
  it('streams tasks, meetings and call logs once each over 2L+1 rows, with exact hasMore', async () => {
    const { ids } = fakeRecruitCrm({ tasks: 3, meetings: 2, 'call-logs': 2 })
    const { seen, more } = await walk(creds(), 3, 3)
    expect(seen).toEqual(ids)
    expect(new Set(seen).size).toBe(7)
    expect(more).toEqual([true, true, false])
  })

  it('crosses uneven upstream pages (100 + 30 tasks), an empty collection, and a source boundary', async () => {
    const { ids, sent } = fakeRecruitCrm({ tasks: 130, meetings: 0, 'call-logs': 5 })
    const { seen, more } = await walk(creds(), 67, 3)
    expect(ids).toHaveLength(135)
    expect(seen).toEqual(ids)
    expect(more).toEqual([true, true, false])
    // Only documented params, at the documented maximum.
    for (const u of sent) {
      expect([...u.searchParams.keys()].sort()).toEqual(['limit', 'page'])
      expect(u.searchParams.get('limit')).toBe('100')
    }
    expect(sent.map((u) => `${u.pathname}?${u.searchParams.get('page')!}`)).toEqual([
      '/v1/tasks?1',
      '/v1/tasks?2',
      '/v1/meetings?1',
      '/v1/call-logs?1',
    ])
  })

  it('ends exactly when the last page is full', async () => {
    fakeRecruitCrm({ tasks: 2, meetings: 1, 'call-logs': 1 })
    const { seen, more } = await walk(creds(), 2, 2)
    expect(seen).toHaveLength(4)
    expect(more).toEqual([true, false])
  })

  it('returns an empty last page when every collection is empty', async () => {
    fakeRecruitCrm({ tasks: 0, meetings: 0, 'call-logs': 0 })
    const { seen, more } = await walk(creds(), 5, 1)
    expect(seen).toEqual([])
    expect(more).toEqual([false])
  })

  it('never serves one connection rows memoised from another connection', async () => {
    // Each connection's tasks live under its own bearer token; meetings and
    // call logs are empty. Page 1 on A leaves A's third task in the memo.
    const a = creds()
    const b = creds()
    const tasksFor: Record<string, number[]> = {
      [`Bearer ${a.accessToken}`]: [1, 2, 3],
      [`Bearer ${b.accessToken}`]: [101, 102, 103],
    }
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = new URL(String(input))
      const auth = new Headers(init?.headers).get('authorization') ?? ''
      const ids = url.pathname === '/v1/tasks' ? (tasksFor[auth] ?? []) : []
      return Response.json({
        current_page: 1,
        next_page_url: null,
        data: ids.map((id) => row('tasks', id)),
      })
    })
    const adapter = new RecruitCrmAdapter()
    const pageA = await adapter.listActivities(a, withPageSink({ page: 1, limit: 2 }))
    expect(pageA.map((r) => r.id)).toEqual(['task_1', 'task_2'])
    const pageB = await adapter.listActivities(b, withPageSink({ page: 2, limit: 2 }))
    expect(pageB.map((r) => r.id)).toEqual(['task_103'])
  })

  it('never calls the undocumented /v1/activities', async () => {
    const { sent } = fakeRecruitCrm({ tasks: 1, meetings: 1, 'call-logs': 1 })
    await new RecruitCrmAdapter().listActivities(creds(), withPageSink({ page: 1, limit: 10 }))
    expect(sent.some((u) => u.pathname.includes('activities'))).toBe(false)
  })
})

describe('recruit-crm getActivity', () => {
  it('reads each listed id back from its collection', async () => {
    const { sent } = fakeRecruitCrm({ tasks: 3, meetings: 3, 'call-logs': 3 })
    const a = new RecruitCrmAdapter()
    const c = creds()
    expect((await a.getActivity(c, 'task_2')).subject).toBe('tasks-2')
    expect((await a.getActivity(c, 'meeting_3')).type).toBe('meeting')
    expect((await a.getActivity(c, 'call-log_1')).note).toBe('n1')
    expect(sent.map((u) => u.pathname)).toEqual([
      '/v1/tasks/2',
      '/v1/meetings/3',
      '/v1/call-logs/1',
    ])
  })

  it('refuses an id with no collection prefix without a request', async () => {
    const { sent } = fakeRecruitCrm({ tasks: 1, meetings: 0, 'call-logs': 0 })
    await expect(new RecruitCrmAdapter().getActivity(creds(), '1')).rejects.toMatchObject({
      statusCode: 404,
    })
    expect(sent).toHaveLength(0)
  })
})

describe('recruit-crm listPipelines', () => {
  it('refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    await expect(
      new RecruitCrmAdapter().listPipelines(creds(), withPageSink({ page: 1, limit: 10 })),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(spy).not.toHaveBeenCalled()
  })
})

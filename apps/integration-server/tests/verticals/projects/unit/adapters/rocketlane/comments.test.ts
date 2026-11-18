/**
 * listComments / getComment against Rocketlane's documented comment API
 * (https://developer.rocketlane.com/reference/get-comments):
 *
 *   GET /1.0/tasks/{taskId}        -> `project.projectId`
 *   GET /1.0/comments              pageSize, pageToken, projectId.eq,
 *                                  sourceType (TASK | PROJECT_CONVERSATIONS,
 *                                  "Defaults to TASK."), includeFields
 *   GET /1.0/comments/{commentId}  the comment object itself
 *
 * There is no task filter, so a task's comments are the project's TASK
 * comments whose `source.sourceId` is the task. The fake honours ONLY the
 * documented parameters and rejects any other.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage, _resetRowPager } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { RocketlaneAdapter } from '../../../../../../src/verticals/projects/adapters/rocketlane/index'
import { CommentSchema } from '../../../../../../src/verticals/projects/schema/comment'

vi.mock('axios')

const C1: Credentials = { accessToken: 'key-1', extra: {} }
const C2: Credentials = { accessToken: 'key-2', extra: {} }

const DOCUMENTED_LIST_PARAMS = new Set([
  'pageSize',
  'pageToken',
  'includeAllFields',
  'sortOrder',
  'match',
  'createdBy.eq',
  'createdAt.gt',
  'createdAt.eq',
  'createdAt.lt',
  'createdAt.ge',
  'createdAt.le',
  'includeFields',
  'isPrivate.eq',
  'projectId.eq',
  'sourceType',
])

interface Req {
  key: string
  path: string
  params: Record<string, unknown>
}

interface RawComment {
  commentId: number
  content: string
  createdAt: number
  createdBy: { userId: number }
  source: { sourceId: number; sourceType: 'TASK' | 'PROJECT_CONVERSATIONS' }
  private: boolean
  attachments?: unknown[]
}

/**
 * Project 500 (key-1) holds task 11's comments interleaved with task 12's and
 * with project conversation comments, so a filtered upstream page holds an
 * uneven number of task-11 rows. Under key-2 the ids are offset by 100000.
 */
function corpus(key: string, task11: number): RawComment[] {
  const base = key === 'key-2' ? 100000 : 0
  const out: RawComment[] = []
  let n = 1
  const push = (sourceId: number, sourceType: RawComment['source']['sourceType']) => {
    out.push({
      commentId: base + n,
      content: `c${n}`,
      createdAt: 1681319726000 + n,
      createdBy: { userId: 7 },
      source: { sourceId, sourceType },
      private: false,
      attachments: [],
    })
    n++
  }
  for (let i = 0; i < task11; i++) {
    push(11, 'TASK')
    if (i % 3 === 0) push(12, 'TASK')
    if (i % 4 === 1) push(500, 'PROJECT_CONVERSATIONS')
    if (i % 5 === 2) {
      push(12, 'TASK')
      push(12, 'TASK')
    }
  }
  return out
}

function fake(opts: { task11: number; upstreamPer?: number; requests?: Req[] }) {
  const requests = opts.requests ?? []
  let minted = 0
  const tokens = new Map<string, { scope: string; offset: number }>()
  vi.mocked(axios.create).mockImplementation(((config?: { headers?: Record<string, unknown> }) => {
    const key = String(config?.headers?.['api-key'] ?? '')
    const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
      const params = { ...(cfg?.params ?? {}) }
      requests.push({ key, path, params })
      const all = corpus(key, opts.task11)
      if (path === '/tasks/11' || path === '/tasks/12') {
        return { data: { taskId: Number(path.slice(7)), project: { projectId: 500 } } }
      }
      const one = /^\/comments\/(\d+)$/.exec(path)
      if (one) {
        const c = all.find((x) => String(x.commentId) === one[1])
        if (!c) throw Object.assign(new Error('404'), { response: { status: 404 } })
        return { data: c }
      }
      if (path !== '/comments') throw new Error(`unexpected path ${path}`)
      for (const k of Object.keys(params)) {
        if (!DOCUMENTED_LIST_PARAMS.has(k)) throw new Error(`undocumented param ${k}`)
      }
      const sourceType = params['sourceType'] ?? 'TASK'
      const project = params['projectId.eq']
      const rows = all.filter(
        (c) =>
          c.source.sourceType === sourceType &&
          (project === undefined || String(project) === '500'),
      )
      let per = params['pageSize'] === undefined ? 100 : Number(params['pageSize'])
      if (per === 0 || per > 100) per = 100
      if (opts.upstreamPer !== undefined) per = Math.min(per, opts.upstreamPer)
      const scope = `${key}|${String(project)}|${String(sourceType)}`
      let offset = 0
      if (params['pageToken'] !== undefined) {
        const t = tokens.get(String(params['pageToken']))
        if (!t || t.scope !== scope) throw new Error('pageToken not valid here')
        offset = t.offset
      }
      const data = rows.slice(offset, offset + per)
      const hasMore = offset + per < rows.length
      const pagination: Record<string, unknown> = { pageSize: per, hasMore }
      if (hasMore) {
        const t = `tok-${++minted}`
        tokens.set(t, { scope, offset: offset + per })
        pagination['nextPageToken'] = t
      }
      return { data: { data, pagination } }
    })
    return { get } as unknown as ReturnType<typeof axios.create>
  }) as unknown as typeof axios.create)
  return { requests }
}

function task11Ids(key: string, total: number): string[] {
  return corpus(key, total)
    .filter((c) => c.source.sourceType === 'TASK' && c.source.sourceId === 11)
    .map((c) => String(c.commentId))
}

beforeEach(() => {
  _resetRowPager()
  vi.clearAllMocks()
})
afterEach(() => _resetRowPager())

describe('rocketlane listComments', () => {
  it('reads the task project, then lists that project TASK comments with documented params', async () => {
    const { requests } = fake({ task11: 3 })
    const out = await new RocketlaneAdapter().listComments(
      C1,
      '11',
      withPageSink({ page: 1, limit: 10 }),
    )
    expect(requests[0]).toMatchObject({ path: '/tasks/11' })
    expect(requests[1]).toEqual({
      key: 'key-1',
      path: '/comments',
      params: {
        pageSize: 100,
        'projectId.eq': '500',
        sourceType: 'TASK',
        includeFields: 'attachments',
      },
    })
    expect(out.map((c) => c.id)).toEqual(task11Ids('key-1', 3))
    for (const c of out) {
      const parsed = CommentSchema.parse(c)
      expect(parsed.taskId).toBe('11')
      expect(parsed.projectId).toBe('500')
    }
  })

  it('pages 1..3 of 2L+1 rows over uneven upstream pages: every id once, exact hasMore', async () => {
    const L = 4
    fake({ task11: 2 * L + 1, upstreamPer: 3 })
    const adapter = new RocketlaneAdapter()
    const served: string[] = []
    const more: unknown[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listComments(C1, '11', params)
      served.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(served).toEqual(task11Ids('key-1', 2 * L + 1))
    expect(new Set(served).size).toBe(2 * L + 1)
    expect(more).toEqual([true, true, false])
  })

  it('an exact multiple ends with hasMore false on the last page', async () => {
    const L = 3
    fake({ task11: 2 * L, upstreamPer: 5 })
    const adapter = new RocketlaneAdapter()
    const more: unknown[] = []
    for (const page of [1, 2]) {
      const params = withPageSink({ page, limit: L })
      expect(await adapter.listComments(C1, '11', params)).toHaveLength(L)
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(more).toEqual([true, false])
  })

  it('a cold jump to page 3 serves the right rows', async () => {
    fake({ task11: 12, upstreamPer: 4 })
    const rows = await new RocketlaneAdapter().listComments(
      C1,
      '11',
      withPageSink({ page: 3, limit: 4 }),
    )
    expect(rows.map((r) => r.id)).toEqual(task11Ids('key-1', 12).slice(8, 12))
  })

  it('two connections interleaved each walk their own rows', async () => {
    const L = 3
    fake({ task11: 2 * L + 1, upstreamPer: 2 })
    const adapter = new RocketlaneAdapter()
    const a1 = await adapter.listComments(C1, '11', withPageSink({ page: 1, limit: L }))
    const b2 = await adapter.listComments(C2, '11', withPageSink({ page: 2, limit: L }))
    const a2 = await adapter.listComments(C1, '11', withPageSink({ page: 2, limit: L }))
    expect(a1.map((r) => r.id)).toEqual(task11Ids('key-1', 2 * L + 1).slice(0, L))
    expect(b2.map((r) => r.id)).toEqual(task11Ids('key-2', 2 * L + 1).slice(L, 2 * L))
    expect(a2.map((r) => r.id)).toEqual(task11Ids('key-1', 2 * L + 1).slice(L, 2 * L))
  })

  it('two tasks of one project interleaved each get only their own comments', async () => {
    fake({ task11: 9, upstreamPer: 3 })
    const adapter = new RocketlaneAdapter()
    const a1 = await adapter.listComments(C1, '11', withPageSink({ page: 1, limit: 3 }))
    const b1 = await adapter.listComments(C1, '12', withPageSink({ page: 1, limit: 3 }))
    const a2 = await adapter.listComments(C1, '11', withPageSink({ page: 2, limit: 3 }))
    expect([...a1, ...a2].map((r) => r.id)).toEqual(task11Ids('key-1', 9).slice(0, 6))
    expect(b1.every((c) => c.taskId === '12')).toBe(true)
    expect(b1).toHaveLength(3)
  })
})

describe('rocketlane listComments edge signals', () => {
  function scripted(responses: Record<string, unknown>, requests: Req[]): void {
    vi.mocked(axios.create).mockImplementation(((config?: {
      headers?: Record<string, unknown>
    }) => {
      const key = String(config?.headers?.['api-key'] ?? '')
      const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
        const params = { ...(cfg?.params ?? {}) }
        requests.push({ key, path, params })
        const tok = params['pageToken'] === undefined ? '' : `?${String(params['pageToken'])}`
        const body = responses[`${path}${tok}`]
        if (body === undefined) throw new Error(`unexpected request ${path}${tok}`)
        return { data: body }
      })
      return { get } as unknown as ReturnType<typeof axios.create>
    }) as unknown as typeof axios.create)
  }
  const row = (id: number) => ({
    commentId: id,
    content: `c${id}`,
    createdAt: 1681319726000,
    createdBy: { userId: 7 },
    source: { sourceId: 11, sourceType: 'TASK' },
    private: false,
  })

  it('stops on pagination.hasMore false even when a nextPageToken is present', async () => {
    const requests: Req[] = []
    scripted(
      {
        '/tasks/11': { taskId: 11, project: { projectId: 500 } },
        '/comments': {
          data: [row(1), row(2)],
          pagination: { pageSize: 100, hasMore: false, nextPageToken: 'stale' },
        },
      },
      requests,
    )
    const params = withPageSink({ page: 1, limit: 5 })
    const out = await new RocketlaneAdapter().listComments(C1, '11', params)
    expect(out.map((c) => c.id)).toEqual(['1', '2'])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(requests.map((r) => r.path)).toEqual(['/tasks/11', '/comments'])
  })

  it('a task with no project.projectId throws and never lists comments', async () => {
    const requests: Req[] = []
    scripted({ '/tasks/11': { taskId: 11 } }, requests)
    await expect(
      new RocketlaneAdapter().listComments(C1, '11', withPageSink({ page: 1, limit: 5 })),
    ).rejects.toThrow(/no project\.projectId/)
    expect(requests.map((r) => r.path)).toEqual(['/tasks/11'])
  })
})

describe('rocketlane getComment', () => {
  it('reads GET /comments/{commentId} (unwrapped object) and parses', async () => {
    const { requests } = fake({ task11: 2 })
    const out = await new RocketlaneAdapter().getComment(C1, '1')
    expect(requests).toEqual([
      { key: 'key-1', path: '/comments/1', params: { includeFields: 'attachments' } },
    ])
    const parsed = CommentSchema.parse(out)
    expect(parsed).toMatchObject({ id: '1', taskId: '11', body: 'c1', authorId: '7' })
  })
})

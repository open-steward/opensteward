/**
 * Kantata OX listComments: a task's posts, paged by the platform's own paging.
 *
 * The OpenAPI description (https://app.mavenlink.com/oas/specification, linked
 * as "Download OpenAPI Description" from
 * https://developer.kantata.com/kantata/specification) lists these query
 * parameters for GET /posts, among others:
 *
 *   story_id  "Only includes posts from the specified task."  (integer)
 *   page      type: integer, default: 1
 *   per_page  type: integer, default: 20, maximum: 200
 *   include   "`user` (User) - The user who created the post." ...
 *
 * It does NOT list `subject_id` as a filter. `subject_id` is a Post response
 * field ("the internal ID of the parent post, or the object to which the reply
 * is made"), so the old `subject_id=<task>` request was an unknown filter and
 * scoped nothing. The fake below honours only the documented parameters and
 * refuses `subject_id`, `cursor`, `limit` and `offset`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import { KantataAdapter } from '../../../../../../src/verticals/projects/adapters/kantata/index'
import { CommentSchema } from '../../../../../../src/verticals/projects/schema/comment'

const CREDS = { accessToken: 'kantata_test' }
const MAX = 200
const TASK = '1937928'

const DOCUMENTED = new Set(['story_id', 'page', 'per_page', 'include'])

/**
 * `n` posts on TASK and 3 posts on another story. Only `story_id` scopes the
 * collection, as the docs describe; an unscoped request would see all of them.
 */
function fakeKantata(n: number) {
  const all = [
    ...Array.from({ length: n }, (_, i) => ({ id: String(i + 1), story: TASK })),
    ...['901', '902', '903'].map((id) => ({ id, story: '555' })),
  ]
  // "`user_id` will only be included in the response if `user` is in the
  // list of included associations" (Post definition), so the fake honours it.
  const post = (id: string, story: string, include: unknown) => {
    const withUser = String(include ?? '')
      .split(',')
      .includes('user')
    return {
      id,
      message: `Post ${id}`,
      has_attachments: false,
      ...(withUser ? { user_id: '2' } : {}),
      workspace_id: '2249167',
      story_id: story,
      // The documented example post elides created_at/updated_at; this is the
      // example's attachment created_at, reused as a well-formed date-time.
      created_at: '2013-04-15T16:48:48-07:00',
      updated_at: '2013-04-15T16:48:48-07:00',
    }
  }
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    const params = cfg?.params ?? {}
    const one = /^\/posts\/(\d+)\.json$/.exec(path)
    if (one) {
      for (const key of Object.keys(params)) {
        if (key !== 'include') throw new Error(`undocumented parameter ${key}`)
      }
      const hit = all.find((p) => p.id === one[1])
      if (!hit) return { data: { count: 0, results: [] } }
      return {
        data: {
          count: 1,
          results: [{ key: 'posts', id: hit.id }],
          posts: { [hit.id]: post(hit.id, hit.story, params['include']) },
        },
      }
    }
    if (path !== '/posts.json') throw new Error(`unexpected path ${path}`)
    for (const key of Object.keys(params)) {
      if (!DOCUMENTED.has(key)) throw new Error(`undocumented parameter ${key}`)
    }
    const page = params['page'] === undefined ? 1 : Number(params['page'])
    const perPage = params['per_page'] === undefined ? 20 : Number(params['per_page'])
    if (!Number.isInteger(page) || page < 1) throw new Error(`bad page ${String(params['page'])}`)
    if (!Number.isInteger(perPage) || perPage < 1 || perPage > MAX) {
      throw new Error(`per_page out of range: ${String(params['per_page'])}`)
    }
    const scoped =
      params['story_id'] === undefined
        ? all
        : all.filter((p) => p.story === String(params['story_id']))
    const slice = scoped.slice((page - 1) * perPage, page * perPage)
    const posts: Record<string, Record<string, unknown>> = {}
    for (const p of slice) posts[p.id] = post(p.id, p.story, params['include'])
    return {
      data: {
        count: scoped.length,
        results: slice.map((p) => ({ key: 'posts', id: p.id })),
        posts,
      },
    }
  })
  vi.spyOn(axios, 'create').mockReturnValue({
    get,
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  } as never)
  return { get }
}

const adapter = () =>
  new KantataAdapter({ clientId: 'c', clientSecret: 's', redirectUri: 'https://example.test/cb' })

afterEach(() => vi.restoreAllMocks())

describe('kantata listComments', () => {
  it('scopes /posts.json to the task with the documented story_id, not subject_id', async () => {
    const { get } = fakeKantata(4)
    const rows = await adapter().listComments(CREDS, TASK, withPageSink({ page: 1, limit: 10 }))
    expect(get.mock.calls[0]?.[0]).toBe('/posts.json')
    const sent = get.mock.calls[0]?.[1]?.params ?? {}
    expect(sent).toMatchObject({ story_id: TASK, page: 1, per_page: 10 })
    expect(sent).not.toHaveProperty('subject_id')
    expect(rows.map((r) => r.id)).toEqual(['1', '2', '3', '4'])
    for (const r of rows) {
      expect(r.taskId).toBe(TASK)
      CommentSchema.parse(r)
    }
  })

  it('includes exactly the documented associations the transform reads (not recipients)', async () => {
    const { get } = fakeKantata(1)
    await adapter().listComments(CREDS, TASK, withPageSink({ page: 1, limit: 5 }))
    const include = String(get.mock.calls[0]?.[1]?.params?.['include'] ?? '').split(',')
    // `recipients` would populate recipient_ids, a private post's audience,
    // which is not the canonical `mentions`.
    expect([...include].sort()).toEqual(['attachments', 'story', 'user', 'workspace'])
  })

  it('walks N = 2L+1 rows over pages 1..3, each id once, in order, hasMore exact', async () => {
    const L = 4
    fakeKantata(2 * L + 1)
    const seen: string[] = []
    const expected = [true, true, false]
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      const rows = await adapter().listComments(CREDS, TASK, params)
      seen.push(...rows.map((r) => r.id))
      expect(readUpstreamPage(params)).toMatchObject({
        hasMore: expected[k - 1],
        totalCount: 2 * L + 1,
      })
      expect(readUpstreamPage(params)?.pageSize).toBeUndefined()
    }
    expect(seen).toEqual(Array.from({ length: 2 * L + 1 }, (_, i) => String(i + 1)))
  })

  it('the page-2 request carries the documented page and per_page', async () => {
    const { get } = fakeKantata(10)
    const rows = await adapter().listComments(CREDS, TASK, withPageSink({ page: 2, limit: 3 }))
    expect(get.mock.calls[0]?.[1]?.params).toMatchObject({ page: 2, per_page: 3, story_id: TASK })
    expect(rows.map((r) => r.id)).toEqual(['4', '5', '6'])
  })

  it('a limit above the documented maximum is clamped to 200 and reported', async () => {
    const { get } = fakeKantata(450)
    const params = withPageSink({ page: 2, limit: 500 })
    const rows = await adapter().listComments(CREDS, TASK, params)
    expect(get.mock.calls[0]?.[1]?.params).toMatchObject({ page: 2, per_page: MAX })
    expect(rows.map((r) => r.id)).toEqual(
      Array.from({ length: MAX }, (_, i) => String(MAX + i + 1)),
    )
    expect(readUpstreamPage(params)).toMatchObject({
      pageSize: MAX,
      hasMore: true,
      totalCount: 450,
    })
  })

  it('API path: parseListQuery + listPage serve page 2 with an exact end', async () => {
    fakeKantata(5)
    const p1 = withPageSink(parseListQuery({ page: '1', limit: '3' }))
    const env1 = listPage(await adapter().listComments(CREDS, TASK, p1), p1, 'kantata')
    expect(env1.data.map((r) => r.id)).toEqual(['1', '2', '3'])
    expect(env1.meta).toMatchObject({ page: 1, hasMore: true, totalCount: 5 })

    const p2 = withPageSink(parseListQuery({ page: '2', limit: '3' }))
    const env2 = listPage(await adapter().listComments(CREDS, TASK, p2), p2, 'kantata')
    expect(env2.data.map((r) => r.id)).toEqual(['4', '5'])
    expect(env2.meta).toMatchObject({ page: 2, hasMore: false, totalCount: 5 })
  })
})

describe('kantata getComment', () => {
  it('reads GET /posts/{id}.json with include=user, so the author id comes back', async () => {
    const { get } = fakeKantata(3)
    const c = await adapter().getComment(CREDS, '2')
    expect(get.mock.calls[0]?.[0]).toBe('/posts/2.json')
    const include = String(get.mock.calls[0]?.[1]?.params?.['include'] ?? '').split(',')
    expect(include).toContain('user')
    CommentSchema.parse(c)
    expect(c).toMatchObject({ id: '2', authorId: '2', taskId: TASK, mentions: [] })
  })
})

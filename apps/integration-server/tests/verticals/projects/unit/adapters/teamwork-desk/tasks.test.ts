/**
 * Teamwork Spaces (slug `teamwork-desk`) tasks = pages.
 *
 * listTasks → GET /spaces/api/v1/spaces/{spaceID}/pages.json
 *   https://apidocs.teamwork.com/docs/spaces/v1/space-content/get-v1-spaces-space-id-pages-json
 *   "Get all pages under the given space"; Path Params: spaceID only. The 200
 *   body is `spaces-api.SpaceContents`:
 *   { "pages" : { "pages" : { "trash" : [ { "childPages" : [...], "id", "slug", "title", "updatedAt" } ] },
 *                 "private" : [ { "trash" : [ ... ] } ] } }
 *   The whole tree comes back at once, so it is flattened and paged locally.
 *
 * getTask → GET /spaces/api/v1/spaces/{spaceID}/pages/{pageID}.json
 *   https://apidocs.teamwork.com/docs/spaces/v1/pages/get-v1-spaces-space-id-pages-page-id-json
 *   "Returns a single page by pageID" → { "page" : { ... } }
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import { TeamworkDeskAdapter } from '../../../../../../src/verticals/projects/adapters/teamwork-desk/index'
import { TaskSchema } from '../../../../../../src/verticals/projects/schema/task'

const CREDS = { accessToken: 'k', extra: { siteUrl: 'https://site.example.test' } }
const L = 3
const N = 2 * L + 1

const node = (id: number, childPages?: object[]) => ({
  ...(childPages ? { childPages } : {}),
  id,
  slug: `p${id}`,
  title: `Page ${id}`,
  updatedAt: '2026-09-24T10:33:14.750Z',
})

/**
 * Seven pages: public tree 1 → (2 → 3), 4; private tree 5 → 6, and 7.
 * Depth-first, parent first: 1, 2, 3, 4, 5, 6, 7.
 */
const TREE = {
  pages: {
    pages: { trash: [node(1, [node(2, [node(3)])]), node(4)] },
    private: [{ trash: [node(5, [node(6)])] }, { trash: [node(7)] }],
  },
}

function fake(bodyFor: (path: string) => unknown) {
  const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
    const keys = Object.keys(config?.params ?? {})
    if (keys.length > 0) throw new Error(`undocumented params ${keys.join(',')} on ${path}`)
    return { data: bodyFor(path) }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
  return { get }
}

const treeOnly = () =>
  fake((path) => {
    if (path === '/spaces/5/pages.json') return TREE
    throw new Error(`unexpected path ${path}`)
  })

const adapter = () => new TeamworkDeskAdapter()

afterEach(() => vi.restoreAllMocks())

describe('teamwork-desk listTasks', () => {
  it('calls the documented tree endpoint with no query parameters', async () => {
    const { get } = treeOnly()
    await adapter().listTasks(CREDS, '5', withPageSink({ page: 1, limit: L }))
    expect(get).toHaveBeenCalledTimes(1)
    expect(get.mock.calls[0]![0]).toBe('/spaces/5/pages.json')
  })

  it('flattens public and private subtrees, parent first, with parent pointers', async () => {
    treeOnly()
    const rows = await adapter().listTasks(CREDS, '5', withPageSink({ page: 1, limit: 100 }))
    expect(rows.map((r) => r.id)).toEqual(['5:1', '5:2', '5:3', '5:4', '5:5', '5:6', '5:7'])
    expect(rows.map((r) => r.parentId)).toEqual([
      undefined,
      '5:1',
      '5:2',
      undefined,
      undefined,
      '5:5',
      undefined,
    ])
    expect(rows.map((r) => r.metadata['isPrivate'])).toEqual([
      'false',
      'false',
      'false',
      'false',
      'true',
      'true',
      'true',
    ])
    for (const r of rows) expect(() => TaskSchema.parse(r)).not.toThrow()
  })

  it('walks pages 1..3 at limit L: every page once, exact hasMore and total', async () => {
    treeOnly()
    const seen: string[] = []
    const expectedHasMore = [true, true, false]
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      const got = (await adapter().listTasks(CREDS, '5', params)).map((r) => r.id)
      expect(got.length).toBe(k < 3 ? L : 1)
      seen.push(...got)
      expect(readUpstreamPage(params)).toMatchObject({
        hasMore: expectedHasMore[k - 1],
        totalCount: N,
        pagedLocally: true,
      })
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => `5:${i + 1}`))
    expect(new Set(seen).size).toBe(N)
  })

  it('API path: parseListQuery + listPage report exact meta', async () => {
    treeOnly()
    const p3 = withPageSink(parseListQuery({ page: '3', limit: String(L) }))
    const env = listPage(await adapter().listTasks(CREDS, '5', p3), p3, 'teamwork-desk')
    expect(env.data.map((r) => r.id)).toEqual(['5:7'])
    expect(env.meta).toMatchObject({ page: 3, hasMore: false, totalCount: N })
  })

  it('an absent private subtree is an empty one', async () => {
    fake(() => ({ pages: { pages: { trash: [node(1)] } } }))
    const rows = await adapter().listTasks(CREDS, '5', withPageSink({ page: 1, limit: L }))
    expect(rows.map((r) => r.id)).toEqual(['5:1'])
  })

  it('an undocumented body shape throws instead of reporting an empty, complete list', async () => {
    // The old parse: a flat array under `pages`.
    fake(() => ({ pages: [{ id: 1, title: 'x' }] }))
    await expect(
      adapter().listTasks(CREDS, '5', withPageSink({ page: 1, limit: L })),
    ).rejects.toThrow(/documented SpacePages shape/)

    vi.restoreAllMocks()
    fake(() => ({}))
    await expect(
      adapter().listTasks(CREDS, '5', withPageSink({ page: 1, limit: L })),
    ).rejects.toThrow(/no documented `pages` object/)

    vi.restoreAllMocks()
    fake(() => ({ pages: { pages: { trash: [] }, private: [{}] } }))
    await expect(
      adapter().listTasks(CREDS, '5', withPageSink({ page: 1, limit: L })),
    ).rejects.toThrow(/pages\.private\[\]/)

    vi.restoreAllMocks()
    fake(() => ({ pages: { pages: { trash: [] }, private: { trash: [] } } }))
    await expect(
      adapter().listTasks(CREDS, '5', withPageSink({ page: 1, limit: L })),
    ).rejects.toThrow(/pages\.private is not the documented array/)
  })

  it('every listed id reads back through getTask on the single-page endpoint', async () => {
    const { get } = fake((path) => {
      if (path === '/spaces/5/pages.json') return TREE
      const m = /^\/spaces\/5\/pages\/(\d+)\.json$/.exec(path)
      if (m) {
        return {
          page: {
            id: Number(m[1]),
            title: `Page ${m[1]}`,
            slug: `p${m[1]}`,
            space: { id: 5, meta: {}, type: 'spaces' },
            state: 'string',
            tags: [],
            updatedAt: '2026-09-24T10:33:14.750Z',
          },
        }
      }
      throw new Error(`unexpected path ${path}`)
    })
    const rows = await adapter().listTasks(CREDS, '5', withPageSink({ page: 1, limit: 100 }))
    for (const row of rows) {
      const got = await adapter().getTask(CREDS, row.id)
      expect(got.id).toBe(row.id)
      expect(got.title).toBe(row.title)
      expect(() => TaskSchema.parse(got)).not.toThrow()
    }
    expect(get.mock.calls.map((c) => c[0])).toContain('/spaces/5/pages/6.json')
  })
})

describe('teamwork-desk getTask', () => {
  it('reads GET /spaces/{spaceID}/pages/{pageID}.json and unwraps `page`', async () => {
    const { get } = fake(() => ({
      page: { id: 9, title: 'Nine', space: { id: 5 }, tags: [{ tag: { id: 3 } }] },
    }))
    const t = await adapter().getTask(CREDS, '5:9')
    expect(get).toHaveBeenCalledTimes(1)
    expect(get.mock.calls[0]![0]).toBe('/spaces/5/pages/9.json')
    expect(t.id).toBe('5:9')
    expect(t.tagIds).toEqual(['3'])
  })

  it('refuses an id without both parts before sending anything', async () => {
    const { get } = fake(() => ({}))
    await expect(adapter().getTask(CREDS, '9')).rejects.toThrow(/\{spaceId\}:\{pageId\}/)
    await expect(adapter().getTask(CREDS, '5:')).rejects.toThrow(/\{spaceId\}:\{pageId\}/)
    await expect(adapter().getTask(CREDS, ':9')).rejects.toThrow(/\{spaceId\}:\{pageId\}/)
    expect(get).not.toHaveBeenCalled()
  })

  it('a body without `page` is not found', async () => {
    fake(() => ({}))
    await expect(adapter().getTask(CREDS, '5:9')).rejects.toThrow(/not found/)
  })
})

describe('teamwork-desk listComments ↔ Task.id', () => {
  it("each comment's taskId is the listed Task.id it hangs off", async () => {
    fake((path) => {
      if (path === '/spaces/5/pages.json') return TREE
      if (path === '/spaces/5/pages/2/comments/inline.json') {
        return { comments: [{ comment: { id: 11 }, replies: [{ comment: { id: 12 } }] }] }
      }
      throw new Error(`unexpected path ${path}`)
    })
    const tasks = await adapter().listTasks(CREDS, '5', withPageSink({ page: 1, limit: 10 }))
    const task = tasks.find((t) => t.externalId === '2')!
    const comments = await adapter().listComments(CREDS, task.id, { page: 1, limit: 10 })
    expect(comments.map((c) => c.taskId)).toEqual([task.id, task.id])
  })
})

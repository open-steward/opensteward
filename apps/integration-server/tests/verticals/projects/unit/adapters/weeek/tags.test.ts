/**
 * Weeek tags, against the OpenAPI spec the developer portal ships
 * (https://developers.weeek.net/api, served from
 * https://developers.weeek.net/assets/weeek.yaml-Bhx55p8P.js):
 *
 *   "/ws/tags":{get:{summary:"Get tags",...,operationId:"get-tags",
 *     tags:["Tags"],parameters:[],responses:{200:{...schema:{type:"object",
 *     properties:{success:{type:"boolean"},tags:{type:"array",
 *     items:e["#/components/schemas/Tag"]}}}
 *   "/ws/tags/{id}":{get:{summary:"Get tag",...,operationId:"get-tag",...
 *     properties:{success:{type:"boolean"},tag:e["#/components/schemas/Tag"]},
 *     required:["success","tag"]
 *
 * The adapter used to call GET /tm/tags and GET /tm/tags/{id}, which are not
 * in the spec, and sent `perPage` (undocumented for tags) so caller page 2
 * repeated page 1. GET /ws/tags declares no parameters: the whole tag list,
 * paged locally. The fake answers only the documented paths and fails on any
 * query input.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage, _resetRowPager } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { WeeekAdapter } from '../../../../../../src/verticals/projects/adapters/weeek/index'
import { TagSchema } from '../../../../../../src/verticals/projects/schema/tag'

vi.mock('axios')

const C1: Credentials = { accessToken: 'tok-1' }

interface Req {
  path: string
  params: Record<string, unknown> | undefined
}

/** The spec's Tag x-examples entry: {id:1,title:"Backend",color:"#aaaaaa"}. */
function tag(i: number) {
  return { id: i + 1, title: i === 0 ? 'Backend' : `Tag ${i}`, color: '#aaaaaa' }
}

function fakeWeeek(total: number) {
  const requests: Req[] = []
  const all = Array.from({ length: total }, (_, i) => tag(i))
  vi.mocked(axios.create).mockImplementation((() => {
    const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
      requests.push({ path, params: cfg?.params })
      if (cfg?.params && Object.keys(cfg.params).length > 0) {
        throw new Error(`undocumented query on ${path}: ${JSON.stringify(cfg.params)}`)
      }
      if (path === '/ws') return { data: { success: true, workspace: { id: 777, title: 'ws' } } }
      if (path === '/ws/tags') return { data: { success: true, tags: all } }
      const m = /^\/ws\/tags\/(\d+)$/.exec(path)
      if (m) {
        const found = all.find((t) => t.id === Number(m[1]))
        if (found) return { data: { success: true, tag: found } }
      }
      throw Object.assign(new Error(`404 ${path}`), { response: { status: 404 } })
    })
    return { get }
  }) as unknown as typeof axios.create)
  return { requests }
}

beforeEach(() => _resetRowPager())
afterEach(() => vi.clearAllMocks())

describe('weeek listTags reads GET /ws/tags', () => {
  it('N = 2L+1 tags at limit L: pages 1-3 serve every id once, hasMore exact', async () => {
    const L = 4
    const { requests } = fakeWeeek(2 * L + 1)
    const adapter = new WeeekAdapter()
    const served: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      served.push(...(await adapter.listTags(C1, '777', params)).map((t) => t.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(served).toEqual(Array.from({ length: 2 * L + 1 }, (_, i) => String(i + 1)))
    expect(more).toEqual([true, true, false])
    expect(requests.map((r) => r.path)).toEqual(['/ws/tags', '/ws/tags', '/ws/tags'])
  })

  it('sends no query input (GET /ws/tags declares parameters:[])', async () => {
    const { requests } = fakeWeeek(3)
    const adapter = new WeeekAdapter()
    const params = withPageSink({ page: 2, limit: 2 })
    const rows = await adapter.listTags(C1, '777', params)
    expect(rows.map((t) => t.id)).toEqual(['3'])
    expect(readUpstreamPage(params)).toMatchObject({
      totalCount: 3,
      hasMore: false,
      pagedLocally: true,
    })
    expect(requests).toHaveLength(1)
    expect(requests[0]!.params).toBeUndefined()
  })

  it('rows parse with TagSchema and carry the caller workspace', async () => {
    fakeWeeek(1)
    const adapter = new WeeekAdapter()
    const [t] = await adapter.listTags(C1, '777', withPageSink({ page: 1, limit: 10 }))
    expect(TagSchema.parse(t)).toMatchObject({
      id: '1',
      externalId: '1',
      workspaceId: '777',
      name: 'Backend',
      color: '#aaaaaa',
      platform: 'weeek',
    })
  })
})

describe('weeek getTag reads GET /ws/tags/{id}', () => {
  it('reads back an id listTags returned', async () => {
    const { requests } = fakeWeeek(5)
    const adapter = new WeeekAdapter()
    const listed = await adapter.listTags(C1, '777', withPageSink({ page: 1, limit: 10 }))
    const got = await adapter.getTag(C1, listed[2]!.id)
    expect(TagSchema.parse(got)).toMatchObject({ id: '3', name: 'Tag 2', workspaceId: '777' })
    expect(requests.map((r) => r.path)).toContain('/ws/tags/3')
    expect(requests.some((r) => r.path.startsWith('/tm/tags'))).toBe(false)
  })
})

/** A fake whose responses are overridden per path. */
function fakeWeeekWith(routes: Record<string, () => unknown>) {
  vi.mocked(axios.create).mockImplementation((() => {
    const get = vi.fn(async (path: string) => {
      const route = routes[path]
      if (route) return { data: route() }
      throw Object.assign(new Error(`404 ${path}`), { response: { status: 404 } })
    })
    return { get }
  }) as unknown as typeof axios.create)
}

describe('weeek getTag needs a real workspace id', () => {
  it('getTag throws when GET /ws fails instead of returning workspaceId ""', async () => {
    fakeWeeekWith({
      '/ws': () => {
        throw Object.assign(new Error('403 /ws'), { response: { status: 403 } })
      },
      '/ws/tags/1': () => ({ success: true, tag: tag(0) }),
    })
    await expect(new WeeekAdapter().getTag(C1, '1')).rejects.toThrow()
  })

  it('getTag throws when GET /ws carries no workspace', async () => {
    fakeWeeekWith({
      '/ws': () => ({ success: true }),
      '/ws/tags/1': () => ({ success: true, tag: tag(0) }),
    })
    await expect(new WeeekAdapter().getTag(C1, '1')).rejects.toThrow(/no workspace/)
  })
})

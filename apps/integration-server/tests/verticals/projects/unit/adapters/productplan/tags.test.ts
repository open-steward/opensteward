/**
 * listTags / getTag against the documented Get Tags endpoint
 * (https://productplan.readme.io/reference/get_api-v2-discovery-ideas-tags.md):
 * `GET /api/v2/discovery/ideas/tags`, no query parameters, 200 body
 * `{"tags": string[]}` ("required": ["tags"]). The old code read a bare array
 * or `results` of `{id,name}` objects, so against the documented shape it
 * returned no tags at all. The endpoint takes no paging parameters, so the
 * whole list arrives in one response and is paged locally.
 */
import { describe, it, expect, vi } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { ProductplanAdapter } from '../../../../../../src/verticals/projects/adapters/productplan/index'
import { TagSchema } from '../../../../../../src/verticals/projects/schema/tag'

vi.mock('axios')

const C: Credentials = { accessToken: 'tok', extra: {} }

interface Req {
  path: string
  params: Record<string, unknown> | undefined
}

function fake(tags: string[], requests: Req[] = []) {
  vi.mocked(axios.create).mockImplementation((() => {
    const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
      requests.push({ path, params: cfg?.params })
      if (path !== '/discovery/ideas/tags') throw new Error(`unexpected path ${path}`)
      // No query parameters are documented for this endpoint.
      if (cfg?.params && Object.keys(cfg.params).length > 0)
        throw new Error(`undocumented params ${JSON.stringify(cfg.params)}`)
      return { data: { tags } }
    })
    return { get } as unknown as ReturnType<typeof axios.create>
  }) as typeof axios.create)
  return requests
}

describe('productplan listTags', () => {
  it('reads the documented `tags` string array', async () => {
    fake(['mobile', 'web'])
    const out = await new ProductplanAdapter().listTags(C, 'ws', { page: 1, limit: 50 })
    expect(out.map((t) => TagSchema.parse(t).id)).toEqual(['mobile', 'web'])
    expect(out.map((t) => t.name)).toEqual(['mobile', 'web'])
  })

  it('serves a repeated tag string once (the tag string is the id)', async () => {
    // The docs do not say the array is unique; a tag's id is its string, so a
    // repeat would otherwise serve one id twice and inflate totalCount.
    fake(['mobile', 'web', 'mobile'])
    const params = withPageSink({ page: 1, limit: 50 })
    const out = await new ProductplanAdapter().listTags(C, 'ws', params)
    expect(out.map((t) => t.id)).toEqual(['mobile', 'web'])
    expect(readUpstreamPage(params)?.totalCount).toBe(2)
  })

  it('sends GET /discovery/ideas/tags with no query parameters', async () => {
    const reqs = fake(['a'])
    await new ProductplanAdapter().listTags(C, 'ws', { page: 2, limit: 3 })
    expect(reqs).toEqual([{ path: '/discovery/ideas/tags', params: undefined }])
  })

  it('walks 2L+1 tags in pages of L: every id once, hasMore exact', async () => {
    const L = 4
    const all = Array.from({ length: 2 * L + 1 }, (_, i) => `tag-${i + 1}`)
    fake(all)
    const adapter = new ProductplanAdapter()
    const seen: string[] = []
    const more: (boolean | undefined)[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listTags(C, 'ws', params)
      const up = readUpstreamPage(params)
      seen.push(...rows.map((t) => t.id))
      more.push(up?.hasMore)
      expect(up?.totalCount).toBe(2 * L + 1)
    }
    expect(seen).toEqual(all)
    expect(more).toEqual([true, true, false])
  })
})

describe('productplan getTag', () => {
  it('returns the tag whose string equals the id', async () => {
    fake(['mobile', 'web'])
    const tag = await new ProductplanAdapter().getTag(C, 'web')
    expect(TagSchema.parse(tag)).toMatchObject({ id: 'web', name: 'web' })
  })

  it('throws 404 NOT_FOUND for an id not in the list', async () => {
    fake(['mobile'])
    await expect(new ProductplanAdapter().getTag(C, 'nope')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    })
  })
})

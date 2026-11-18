/**
 * listTags reads GET /v3/queues/{queue_ID}/tags
 * (https://yandex.ru/support/tracker/en/api/queues/get-tags): "Use this request
 * to get a list of tags added to a queue." The response is a bare array of tag
 * strings. The page documents no parameters of its own, but the common format
 * (https://yandex.ru/support/tracker/en/common-format, "Paginated display of
 * results") says "If you request a list of objects and the number of rows in
 * the response exceeds 50, the response returns a page", paged by `perPage`
 * ("Default value: 50") and `page`, with `X-Total-Pages` / `X-Total-Count`
 * response headers. So listTags walks every upstream page, then pages locally.
 *
 * It used to search one page of issues (POST /v3/issues/_search) and collect
 * their `tags`, so tags on issues past that page were never listed, and a
 * queue tag on no issue was never listed at all.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { YandexTrackerAdapter } from '../../../../../../src/verticals/projects/adapters/yandex-tracker/index'
import { TagSchema } from '../../../../../../src/verticals/projects/schema/tag'

vi.mock('axios')

const C1: Credentials = { accessToken: 'tok-1' }

interface Req {
  method: string
  path: string
  params: Record<string, unknown> | undefined
  headers: Record<string, unknown>
}

/**
 * A queue-tags endpoint that honours only the documented resource path and the
 * common-format `perPage` (default 50) and `page` (default 1) parameters, and
 * sends `X-Total-Pages` / `X-Total-Count`. With `paged: false` it returns the
 * whole body with no headers (an endpoint that does not paginate).
 */
function fakeTracker(tagsByQueue: Record<string, unknown>, opts: { paged?: boolean } = {}) {
  const paged = opts.paged ?? true
  const requests: Req[] = []
  vi.mocked(axios.create).mockImplementation(((config?: { headers?: Record<string, unknown> }) => {
    const headers = { ...(config?.headers ?? {}) }
    const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
      requests.push({ method: 'GET', path, params: cfg?.params, headers })
      const m = path.match(/^\/queues\/([^/]+)\/tags$/)
      if (!m) throw new Error(`unexpected path ${path}`)
      for (const k of Object.keys(cfg?.params ?? {})) {
        if (k !== 'perPage' && k !== 'page') throw new Error(`undocumented param ${k}`)
      }
      const tags = tagsByQueue[decodeURIComponent(m[1]!)]
      if (tags === undefined) throw Object.assign(new Error('404'), { response: { status: 404 } })
      if (!paged || !Array.isArray(tags)) return { data: tags, headers: {} }
      const perPage = Number(cfg?.params?.['perPage'] ?? 50)
      const page = Number(cfg?.params?.['page'] ?? 1)
      return {
        data: tags.slice((page - 1) * perPage, page * perPage),
        headers: {
          'X-Total-Pages': String(Math.max(1, Math.ceil(tags.length / perPage))),
          'X-Total-Count': String(tags.length),
        },
      }
    })
    const post = vi.fn(async (path: string) => {
      requests.push({ method: 'POST', path, params: undefined, headers })
      throw new Error(`unexpected POST ${path}`)
    })
    return { get, post }
  }) as unknown as typeof axios.create)
  return requests
}

function adapter(): YandexTrackerAdapter {
  return new YandexTrackerAdapter({
    clientId: 'id',
    clientSecret: 'secret',
    redirectUri: 'https://example.com/cb',
    orgId: '123',
  })
}

const tagNames = (n: number) => Array.from({ length: n }, (_, i) => `tag${i + 1}`)

afterEach(() => {
  vi.clearAllMocks()
})

describe('yandex-tracker listTags', () => {
  it('GETs /queues/{queue_ID}/tags with the common-format paging params and the org header', async () => {
    const requests = fakeTracker({ TEST: ['tag1', 'tag2', 'tag3'] })
    const tags = await adapter().listTags(C1, 'TEST', withPageSink({ page: 1, limit: 50 }))
    expect(requests).toHaveLength(1)
    expect(requests[0]!.method).toBe('GET')
    expect(requests[0]!.path).toBe('/queues/TEST/tags')
    expect(requests[0]!.params).toEqual({ perPage: 50, page: 1 })
    expect(requests[0]!.headers['X-Org-ID']).toBe('123')
    expect(requests[0]!.headers['Authorization']).toBe('OAuth tok-1')
    expect(tags.map((t) => TagSchema.parse(t))).toHaveLength(3)
    expect(tags.map((t) => [t.id, t.workspaceId])).toEqual([
      ['tag1', 'TEST'],
      ['tag2', 'TEST'],
      ['tag3', 'TEST'],
    ])
  })

  it('does not search issues', async () => {
    const requests = fakeTracker({ TEST: ['tag1'] })
    await adapter().listTags(C1, 'TEST', withPageSink({ page: 1, limit: 50 }))
    expect(requests.some((r) => r.path.includes('_search'))).toBe(false)
  })

  it('encodes the queue id into the path', async () => {
    const requests = fakeTracker({ 'A/B': ['tag1'] })
    await adapter().listTags(C1, 'A/B', withPageSink({ page: 1, limit: 50 }))
    expect(requests[0]!.path).toBe('/queues/A%2FB/tags')
  })

  it('N = 2L+1 tags at limit L: pages 1-3 serve every tag once, in order, hasMore exact', async () => {
    const L = 4
    const all = tagNames(2 * L + 1)
    fakeTracker({ TEST: all })
    const a = adapter()
    const served: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await a.listTags(C1, 'TEST', params)
      served.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(served).toEqual(all)
    expect(more).toEqual([true, true, false])
  })

  it('API path: parseListQuery + listPage walks the whole list once', async () => {
    const all = tagNames(230)
    fakeTracker({ TEST: all })
    const a = adapter()
    const served: string[] = []
    for (let page = 1; page < 20; page++) {
      const params = parseListQuery({ limit: '25', page: String(page) })
      const env = listPage(await a.listTags(C1, 'TEST', params), params, 'yandex-tracker')
      served.push(...env.data.map((r) => r.id))
      if (env.meta.hasMore !== true) break
    }
    expect(served).toEqual(all)
  })

  it('walks every upstream page of a queue with more than 50 tags (X-Total-Pages)', async () => {
    const all = tagNames(120)
    const requests = fakeTracker({ TEST: all })
    const params = withPageSink({ page: 1, limit: 200 })
    const rows = await adapter().listTags(C1, 'TEST', params)
    expect(rows.map((r) => r.id)).toEqual(all)
    expect(requests.map((r) => r.params)).toEqual([
      { perPage: 50, page: 1 },
      { perPage: 50, page: 2 },
      { perPage: 50, page: 3 },
    ])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('caller page 3 at limit 25 over 120 tags serves tags 51-75 with hasMore true', async () => {
    const all = tagNames(120)
    fakeTracker({ TEST: all })
    const params = withPageSink({ page: 3, limit: 25 })
    const rows = await adapter().listTags(C1, 'TEST', params)
    expect(rows.map((r) => r.id)).toEqual(all.slice(50, 75))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('a response without paging headers is the whole list: one request', async () => {
    const all = tagNames(70)
    const requests = fakeTracker({ TEST: all }, { paged: false })
    const rows = await adapter().listTags(C1, 'TEST', withPageSink({ page: 1, limit: 100 }))
    expect(rows.map((r) => r.id)).toEqual(all)
    expect(requests).toHaveLength(1)
  })

  it('throws on a body that is not an array instead of serving an empty complete list', async () => {
    fakeTracker({ TEST: { tags: ['tag1'] } })
    await expect(
      adapter().listTags(C1, 'TEST', withPageSink({ page: 1, limit: 50 })),
    ).rejects.toThrow(/not an array/)
  })
})

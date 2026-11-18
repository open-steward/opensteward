/**
 * ZenHub's GraphQL API pages every list Relay-style: "We use the Relay style
 * cursor-based pagination model with first/after and last/before pagination
 * arguments. When querying for lists, it is required that you specify a first
 * or last value, and that this value be no more than 100." The next page is
 * fetched by passing `pageInfo.endCursor` as `after` "as long as
 * `pageInfo.hasNextPage` returns true"
 * (https://developers.zenhub.com/graphql-api-docs/pagination).
 *
 * `listTags` read only `params.cursor`, so caller page 2 repeated page 1. It
 * now walks `after` one upstream page per caller page. listComments,
 * listWorkspaces and listUsers are covered in lists.test.ts.
 *
 * The fake honours ONLY `first` (1..100, required) and `after`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import {
  withPageSink,
  readUpstreamPage,
  _resetCursorPager,
  parseListQuery,
  listPage,
} from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { ZenhubAdapter } from '../../../../../../src/verticals/projects/adapters/zenhub/index'

vi.mock('axios')

const C1: Credentials = { accessToken: 'zh-token-1', extra: {} }
const C2: Credentials = { accessToken: 'zh-token-2', extra: {} }

const ZH_MAX = 100

interface Req {
  token: string
  variables: Record<string, unknown>
}

function labelId(token: string, repo: string, n: number): string {
  return `label-${token}-${repo}-${String(n).padStart(4, '0')}`
}

function labelIds(token: string, repo: string, from: number, n: number): string[] {
  return Array.from({ length: n }, (_, i) => labelId(token, repo, from + i))
}

/**
 * Opaque cursor bound to one token and one repository: replaying it for a
 * different connection or repository is rejected, as a real upstream would.
 */
function encode(offset: number, token: string, repo = 'r1'): string {
  return Buffer.from(`cursor:${token}:${repo}:${offset}`).toString('base64')
}

function decode(cursor: string, token: string, repo: string): number {
  const text = Buffer.from(cursor, 'base64').toString('utf8')
  const m = text.match(/^cursor:([^:]+):([^:]+):(\d+)$/)
  if (!m || m[1] !== token || m[2] !== repo) throw new Error(`foreign cursor ${cursor}`)
  return Number(m[3])
}

function fakeZenhub(total: number, requests: Req[] = []) {
  vi.mocked(axios.create).mockImplementation(((config?: { headers?: Record<string, unknown> }) => {
    const token = String(config?.headers?.['Authorization'] ?? '').replace(/^Bearer /, '')
    const post = vi.fn(
      async (_url: string, body: { query: string; variables?: Record<string, unknown> }) => {
        const variables = { ...(body.variables ?? {}) }
        requests.push({ token, variables })
        if (!body.query.includes('query RepositoryLabels')) throw new Error('unexpected query')
        const first = variables['first']
        if (typeof first !== 'number' || !Number.isInteger(first) || first < 1 || first > ZH_MAX)
          throw new Error(`first ${String(first)} out of range`)
        const repo = String(variables['id'])
        const after = variables['after']
        const start = typeof after === 'string' ? decode(after, token, repo) : 0
        const all = Array.from({ length: total }, (_, i) => ({
          id: labelId(token, repo, i),
          name: `n${i}`,
          color: 'ffffff',
        }))
        const nodes = all.slice(start, start + first)
        const end = start + nodes.length
        return {
          data: {
            data: {
              node: {
                id: repo,
                name: repo,
                labels: {
                  nodes,
                  pageInfo: {
                    hasNextPage: end < total,
                    endCursor: nodes.length > 0 ? encode(end, token, repo) : null,
                  },
                },
              },
            },
          },
        }
      },
    )
    return { post } as unknown as ReturnType<typeof axios.create>
  }) as unknown as typeof axios.create)
  return { requests }
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.clearAllMocks())

describe('zenhub listTags pages by first/after', () => {
  it('N = 2L+1 rows at limit L: pages 1-3 serve every id once, in order, hasMore exact', async () => {
    const L = 40
    fakeZenhub(2 * L + 1)
    const a = new ZenhubAdapter()
    const served: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await a.listTags(C1, 'r1', params)
      served.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(served).toEqual(labelIds('zh-token-1', 'r1', 0, 2 * L + 1))
    expect(more).toEqual([true, true, false])
  })

  it('page 2 is fetched with after = page 1 endCursor and first = L', async () => {
    const L = 40
    const { requests } = fakeZenhub(2 * L + 1)
    await new ZenhubAdapter().listTags(C1, 'r1', withPageSink({ page: 2, limit: L }))
    expect(requests).toHaveLength(2)
    expect(requests[0]!.variables['after']).toBeUndefined()
    expect(requests[1]!.variables['after']).toBe(encode(L, 'zh-token-1'))
    expect(requests.map((r) => r.variables['first'])).toEqual([L, L])
  })

  it('a limit above 100 is sent as first = 100 and reported as the page size', async () => {
    const { requests } = fakeZenhub(250)
    const a = new ZenhubAdapter()
    const p1 = withPageSink({ page: 1, limit: 250 })
    const r1 = await a.listTags(C1, 'r1', p1)
    const p2 = withPageSink({ page: 2, limit: 250 })
    const r2 = await a.listTags(C1, 'r1', p2)
    expect(requests.map((r) => r.variables['first'])).toEqual([100, 100])
    expect(readUpstreamPage(p1)?.pageSize).toBe(100)
    expect(r1.map((r) => r.id)).toEqual(labelIds('zh-token-1', 'r1', 0, 100))
    expect(r2.map((r) => r.id)).toEqual(labelIds('zh-token-1', 'r1', 100, 100))
  })

  it('API path: parseListQuery + listPage walks the whole collection once', async () => {
    fakeZenhub(230)
    const a = new ZenhubAdapter()
    const served: string[] = []
    for (let page = 1; page < 20; page++) {
      const params = parseListQuery({ limit: '25', page: String(page) })
      const env = listPage(await a.listTags(C1, 'r1', params), params, 'zenhub')
      served.push(...env.data.map((r) => r.id))
      if (env.meta.hasMore !== true) break
    }
    expect(served).toEqual(labelIds('zh-token-1', 'r1', 0, 230))
  })

  it('two connections and two repositories interleaved each walk their own rows', async () => {
    const L = 40
    fakeZenhub(2 * L + 1)
    const a = new ZenhubAdapter()
    const a1 = await a.listTags(C1, 'r1', withPageSink({ page: 1, limit: L }))
    const b2 = await a.listTags(C2, 'r1', withPageSink({ page: 2, limit: L }))
    const c2 = await a.listTags(C1, 'r2', withPageSink({ page: 2, limit: L }))
    const a2 = await a.listTags(C1, 'r1', withPageSink({ page: 2, limit: L }))
    expect(a1.map((r) => r.id)).toEqual(labelIds('zh-token-1', 'r1', 0, L))
    expect(b2.map((r) => r.id)).toEqual(labelIds('zh-token-2', 'r1', L, L))
    expect(c2.map((r) => r.id)).toEqual(labelIds('zh-token-1', 'r2', L, L))
    expect(a2.map((r) => r.id)).toEqual(labelIds('zh-token-1', 'r1', L, L))
  })

  it('a cursor remembered at one limit is not reused for another limit', async () => {
    fakeZenhub(100)
    const a = new ZenhubAdapter()
    await a.listTags(C1, 'r1', withPageSink({ page: 1, limit: 40 }))
    await a.listTags(C1, 'r1', withPageSink({ page: 2, limit: 40 }))
    const rows = await a.listTags(C1, 'r1', withPageSink({ page: 2, limit: 10 }))
    expect(rows.map((r) => r.id)).toEqual(labelIds('zh-token-1', 'r1', 10, 10))
  })

  it('an explicit cursor param still names the upstream page directly', async () => {
    const L = 10
    const { requests } = fakeZenhub(25)
    const params = withPageSink({ limit: L, cursor: encode(20, 'zh-token-1') })
    const rows = await new ZenhubAdapter().listTags(C1, 'r1', params)
    expect(requests).toHaveLength(1)
    expect(rows.map((r) => r.id)).toEqual(labelIds('zh-token-1', 'r1', 20, 5))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })
})

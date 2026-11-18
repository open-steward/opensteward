/**
 * Perdoo's GraphQL API pages every list connection Relay-style: each list
 * field (`objectives`, `keyResults`, `allGroups`, `allUsers`) takes
 * `first: Int` and `after: String`, and returns `pageInfo` whose
 * `hasNextPage` is documented as "When paginating forwards, are there more
 * items?" and whose `endCursor` is "When paginating forwards, the cursor to
 * continue." (Perdoo's published schema, https://api-docs.perdoo.com/ →
 * https://studio.apollographql.com/public/Perdoo-GQL/variant/current).
 *
 * The schema documents no maximum for `first`, so the adapter sends the
 * caller's limit as-is and declares no `maxPageSize`.
 *
 * Every list used to read only `params.cursor`, so caller page 2 repeated
 * page 1. The fake honours ONLY `first` and `after` (plus each list's filter).
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
import type { Credentials, QueryParams } from '@opensteward/shared'
import { PerdooAdapter } from '../../../../../../src/verticals/projects/adapters/perdoo/index'

vi.mock('axios')

const C1: Credentials = { accessToken: 'tok-1' }
const C2: Credentials = { accessToken: 'tok-2' }

type Field = 'objectives' | 'keyResults' | 'allGroups' | 'allUsers'

interface Req {
  token: string
  field: Field
  variables: Record<string, unknown>
}

const FIELD_OF: Array<[RegExp, Field]> = [
  [/query ListObjectives/, 'objectives'],
  [/query ListKeyResults/, 'keyResults'],
  [/query ListGroups/, 'allGroups'],
  [/query ListUsers/, 'allUsers'],
]

/** The filter variable each list scopes by, if any. */
const PARENT_VAR: Partial<Record<Field, string>> = {
  objectives: 'groups_Id',
  keyResults: 'objective',
}

function idOf(field: Field, token: string, parent: string, n: number): string {
  return `${field}-${token}-${parent}-${String(n).padStart(4, '0')}`
}

function node(field: Field, id: string): Record<string, unknown> {
  switch (field) {
    case 'objectives':
      return { id, name: id, status: 'ON_TRACK', progress: 0 }
    case 'keyResults':
      return { id, name: id, status: 'ON_TRACK', objective: { id: 'o', name: 'o' } }
    case 'allGroups':
      return { id, name: id }
    case 'allUsers':
      return { id, name: id, email: `${id}@x.io`, role: 'standard', isActive: true }
  }
}

/**
 * One Perdoo connection field holding `total` rows per (token, parent).
 * Honours only `first` (default 20, as the constants note) and `after`; the
 * cursor is opaque and bound to token, field and parent, so a cursor borrowed
 * from another connection or parent is rejected.
 */
function fakePerdoo(
  field: Field,
  total: number,
  requests: Req[] = [],
  opts: { alwaysHasNext?: boolean } = {},
) {
  vi.mocked(axios.create).mockImplementation(((config?: { headers?: Record<string, unknown> }) => {
    const token = String(config?.headers?.['Authorization'] ?? '').replace(/^Bearer /, '')
    const post = vi.fn(
      async (_path: string, body: { query: string; variables?: Record<string, unknown> }) => {
        const hit = FIELD_OF.find(([re]) => re.test(body.query))
        if (!hit || hit[1] !== field) throw new Error('unexpected query')
        const variables = { ...(body.variables ?? {}) }
        requests.push({ token, field, variables })
        const pv = PARENT_VAR[field]
        const parent = pv && variables[pv] !== undefined ? String(variables[pv]) : 'all'
        const firstRaw = variables['first']
        const first = firstRaw === undefined ? 20 : Number(firstRaw)
        if (!Number.isInteger(first) || first < 1) throw new Error(`first ${String(firstRaw)}`)
        let start = 0
        if (variables['after'] !== undefined) {
          const [t, f, p, pos] = Buffer.from(String(variables['after']), 'base64')
            .toString()
            .split('|')
          if (t !== token || f !== field || p !== parent) throw new Error('foreign cursor')
          start = Number(pos)
        }
        const end = Math.min(start + first, total)
        const edges = Array.from({ length: end - start }, (_, i) => ({
          node: node(field, idOf(field, token, parent, start + i)),
        }))
        return {
          data: {
            data: {
              [field]: {
                pageInfo: {
                  // alwaysHasNext models an upstream that keeps saying "more" and
                  // hands out a cursor even on an empty page past the end.
                  hasNextPage: opts.alwaysHasNext === true || end < total,
                  endCursor:
                    edges.length > 0 || opts.alwaysHasNext === true
                      ? Buffer.from(`${token}|${field}|${parent}|${end}`).toString('base64')
                      : null,
                },
                edges,
              },
            },
          },
        }
      },
    )
    return { post }
  }) as unknown as typeof axios.create)
  return { requests }
}

type Lister = (
  a: PerdooAdapter,
  c: Credentials,
  parent: string,
  p: QueryParams,
) => Promise<{ id: string }[]>

const LISTS: Array<[string, Field, Lister]> = [
  [
    'listProjects',
    'objectives',
    (a, c, parent, p) => {
      p['workspace_id'] = parent
      return a.listProjects(c, p)
    },
  ],
  ['listTasks', 'keyResults', (a, c, parent, p) => a.listTasks(c, parent, p)],
  ['listWorkspaces', 'allGroups', (a, c, _parent, p) => a.listWorkspaces(c, p)],
  ['listUsers', 'allUsers', (a, c, _parent, p) => a.listUsers(c, 'ws', p)],
]

function ids(field: Field, token: string, parent: string, from: number, n: number): string[] {
  const par = PARENT_VAR[field] ? parent : 'all'
  return Array.from({ length: n }, (_, i) => idOf(field, token, par, from + i))
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.clearAllMocks())

describe.each(LISTS)('perdoo %s pages at the caller size', (_name, field, list) => {
  it('N = 2L+1 rows at limit L: pages 1-3 serve every id once, in order, hasMore exact', async () => {
    const L = 7
    fakePerdoo(field, 2 * L + 1)
    const adapter = new PerdooAdapter()
    const served: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await list(adapter, C1, 'p1', params)
      served.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(served).toEqual(ids(field, 'tok-1', 'p1', 0, 2 * L + 1))
    expect(more).toEqual([true, true, false])
  })

  it('page 1 sends first = limit; page 2 carries after = the previous endCursor', async () => {
    const { requests } = fakePerdoo(field, 100)
    const adapter = new PerdooAdapter()
    await list(adapter, C1, 'p1', withPageSink({ page: 1, limit: 30 }))
    await list(adapter, C1, 'p1', withPageSink({ page: 2, limit: 30 }))
    expect(requests).toHaveLength(2)
    expect(requests[0]!.variables['first']).toBe(30)
    expect(requests[0]!.variables['after']).toBeUndefined()
    expect(requests[1]!.variables['first']).toBe(30)
    const parent = PARENT_VAR[field] ? 'p1' : 'all'
    expect(requests[1]!.variables['after']).toBe(
      Buffer.from(`tok-1|${field}|${parent}|30`).toString('base64'),
    )
  })

  it('a large limit is sent as first unchanged, since Perdoo documents no maximum', async () => {
    const { requests } = fakePerdoo(field, 300)
    const adapter = new PerdooAdapter()
    const params = withPageSink({ page: 1, limit: 250 })
    const rows = await list(adapter, C1, 'p1', params)
    expect(requests[0]!.variables['first']).toBe(250)
    expect(rows).toHaveLength(250)
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    expect(readUpstreamPage(params)?.pageSize).toBeUndefined()
  })

  it('API path: parseListQuery + listPage walks the whole collection once', async () => {
    fakePerdoo(field, 230)
    const adapter = new PerdooAdapter()
    const served: string[] = []
    for (let page = 1; page < 20; page++) {
      const params = parseListQuery({ limit: '25', page: String(page) })
      const env = listPage(await list(adapter, C1, 'p1', params), params, 'perdoo')
      served.push(...env.data.map((r) => r.id))
      if (env.meta.hasMore !== true) break
    }
    expect(served).toEqual(ids(field, 'tok-1', 'p1', 0, 230))
  })

  it('two connections interleaved within the TTL each walk their own rows', async () => {
    const L = 10
    fakePerdoo(field, 2 * L + 1)
    const adapter = new PerdooAdapter()
    const a1 = await list(adapter, C1, 'p1', withPageSink({ page: 1, limit: L }))
    const b2 = await list(adapter, C2, 'p1', withPageSink({ page: 2, limit: L }))
    const a2 = await list(adapter, C1, 'p1', withPageSink({ page: 2, limit: L }))
    expect(a1.map((r) => r.id)).toEqual(ids(field, 'tok-1', 'p1', 0, L))
    expect(b2.map((r) => r.id)).toEqual(ids(field, 'tok-2', 'p1', L, L))
    expect(a2.map((r) => r.id)).toEqual(ids(field, 'tok-1', 'p1', L, L))
  })

  it('changing the limit between pages never reuses a cursor stored at another size', async () => {
    fakePerdoo(field, 300)
    const adapter = new PerdooAdapter()
    const p1 = await list(adapter, C1, 'p1', withPageSink({ page: 1, limit: 25 }))
    const p2 = await list(adapter, C1, 'p1', withPageSink({ page: 2, limit: 50 }))
    expect(p1.map((r) => r.id)).toEqual(ids(field, 'tok-1', 'p1', 0, 25))
    expect(p2.map((r) => r.id)).toEqual(ids(field, 'tok-1', 'p1', 50, 50))
  })

  it('an explicit cursor param is sent as after and names the upstream page directly', async () => {
    const { requests } = fakePerdoo(field, 40)
    const adapter = new PerdooAdapter()
    const parent = PARENT_VAR[field] ? 'p1' : 'all'
    const cursor = Buffer.from(`tok-1|${field}|${parent}|10`).toString('base64')
    const params = withPageSink({ page: 1, limit: 5 })
    params['cursor'] = cursor
    const rows = await list(adapter, C1, 'p1', params)
    expect(requests).toHaveLength(1)
    expect(requests[0]!.variables['after']).toBe(cursor)
    expect(rows.map((r) => r.id)).toEqual(ids(field, 'tok-1', 'p1', 10, 5))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('an explicit cursor on the last upstream page reports hasMore false', async () => {
    const { requests } = fakePerdoo(field, 40)
    const adapter = new PerdooAdapter()
    const parent = PARENT_VAR[field] ? 'p1' : 'all'
    const cursor = Buffer.from(`tok-1|${field}|${parent}|35`).toString('base64')
    const params = withPageSink({ page: 1, limit: 5 })
    params['cursor'] = cursor
    const rows = await list(adapter, C1, 'p1', params)
    expect(requests).toHaveLength(1)
    expect(rows.map((r) => r.id)).toEqual(ids(field, 'tok-1', 'p1', 35, 5))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('an empty page ends the walk even when pageInfo still says hasNextPage with a cursor', async () => {
    const L = 5
    fakePerdoo(field, L, [], { alwaysHasNext: true })
    const adapter = new PerdooAdapter()
    const p1 = withPageSink({ page: 1, limit: L })
    const r1 = await list(adapter, C1, 'p1', p1)
    expect(r1.map((r) => r.id)).toEqual(ids(field, 'tok-1', 'p1', 0, L))
    const p2 = withPageSink({ page: 2, limit: L })
    const r2 = await list(adapter, C1, 'p1', p2)
    expect(r2).toEqual([])
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
    // Same through an explicit cursor pointing past the end.
    const parent = PARENT_VAR[field] ? 'p1' : 'all'
    const p3 = withPageSink({ page: 1, limit: L })
    p3['cursor'] = Buffer.from(`tok-1|${field}|${parent}|${L}`).toString('base64')
    expect(await list(adapter, C1, 'p1', p3)).toEqual([])
    expect(readUpstreamPage(p3)?.hasMore).toBe(false)
  })

  it('a fractional limit is sent as a whole-number first (GraphQL Int)', async () => {
    const { requests } = fakePerdoo(field, 30)
    const adapter = new PerdooAdapter()
    await list(adapter, C1, 'p1', withPageSink({ page: 1, limit: 7.5 }))
    expect(requests[0]!.variables['first']).toBe(7)
  })

  it('with no limit it sends the adapter default first of 100', async () => {
    const { requests } = fakePerdoo(field, 30)
    const adapter = new PerdooAdapter()
    await list(adapter, C1, 'p1', withPageSink({ page: 1 }))
    expect(requests[0]!.variables['first']).toBe(100)
  })

  it.runIf(PARENT_VAR[field] !== undefined)(
    'two parents interleaved each walk their own rows',
    async () => {
      const L = 10
      fakePerdoo(field, 2 * L + 1)
      const adapter = new PerdooAdapter()
      const a1 = await list(adapter, C1, 'p1', withPageSink({ page: 1, limit: L }))
      const b2 = await list(adapter, C1, 'p2', withPageSink({ page: 2, limit: L }))
      const a2 = await list(adapter, C1, 'p1', withPageSink({ page: 2, limit: L }))
      expect(a1.map((r) => r.id)).toEqual(ids(field, 'tok-1', 'p1', 0, L))
      expect(b2.map((r) => r.id)).toEqual(ids(field, 'tok-1', 'p2', L, L))
      expect(a2.map((r) => r.id)).toEqual(ids(field, 'tok-1', 'p1', L, L))
    },
  )
})

/**
 * Planview AdaptiveWork (Clarizen REST v2.0) pages `POST data/entityQuery`
 * with a `paging` object (https://api.clarizen.com/V2.0/services/types/Paging):
 * "from integer The record number to start retrieve from", "limit integer
 * Number of records to retrieve", and on the result "hasMore boolean ...
 * indicates whether there are more records to fetch for this query".
 *
 * Every list used to send `paging.from` from `params.cursor` only, so caller
 * page 2 repeated page 1. The fake honours ONLY `paging.from` / `paging.limit`
 * and answers with `paging.hasMore`.
 *
 * listWorkspaces reads the single connected Organization via
 * `GET data/objects/Organization/{uuid}` ("Read an entity"), a whole
 * one-row collection, so it pages locally.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { PlanviewAdaptiveworkAdapter } from '../../../../../../src/verticals/projects/adapters/planview-adaptivework/index'

vi.mock('axios')

const ORG = '/Organization/org-1'
const CREDS: Credentials = {
  accessToken: 'session-1',
  extra: { baseUrl: 'https://api2.example.test/v2.0/services', organizationId: ORG },
}

interface Req {
  path: string
  body: Record<string, unknown>
}

type TypeName = 'Project' | 'Task' | 'Discussion' | 'User'

function idOf(type: TypeName, n: number): string {
  return `/${type}/${type.toLowerCase()}-${String(n).padStart(4, '0')}`
}

function row(type: TypeName, n: number): Record<string, unknown> {
  const id = idOf(type, n)
  const base = {
    id,
    CreatedOn: '2025-01-01T00:00:00.000Z',
    LastUpdatedOn: '2025-01-02T00:00:00.000Z',
  }
  switch (type) {
    case 'Project':
      return { ...base, Name: id }
    case 'Task':
      return { ...base, Name: id, Project: { id: '/Project/p1', Name: 'P1' } }
    case 'Discussion':
      return { ...base, Text: id, Container: { id: '/Task/t1', Name: 'T1' } }
    case 'User':
      return { ...base, FirstName: id, LastName: 'X', Email: `u${n}@example.com` }
  }
}

/** entityQuery over `total` rows per type, honouring only paging.from / paging.limit. */
function fakeClarizen(total: number, requests: Req[] = []) {
  vi.mocked(axios.create).mockImplementation((() => {
    const post = vi.fn(async (path: string, body: Record<string, unknown>) => {
      requests.push({ path, body })
      if (path !== '/data/entityQuery') throw new Error(`unexpected path ${path}`)
      const type = body['typeName'] as TypeName
      const paging = (body['paging'] ?? {}) as Record<string, unknown>
      const from = paging['from'] ?? 0
      const limit = paging['limit']
      if (typeof from !== 'number' || !Number.isInteger(from) || from < 0)
        throw new Error(`paging.from ${String(from)} invalid`)
      if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1)
        throw new Error(`paging.limit ${String(limit)} invalid`)
      const all = Array.from({ length: total }, (_, i) => row(type, i))
      const entities = all.slice(from, from + limit)
      return {
        data: {
          entities,
          paging: { from: from + entities.length, limit, hasMore: from + limit < total },
        },
      }
    })
    const get = vi.fn(async (path: string) => {
      requests.push({ path, body: {} })
      if (path !== '/data/objects/Organization/org-1') throw new Error(`unexpected path ${path}`)
      return { data: { id: ORG, Name: 'Acme', CreatedOn: '2025-01-01T00:00:00.000Z' } }
    })
    return { post, get }
  }) as unknown as typeof axios.create)
  return { requests }
}

type Lister = (a: PlanviewAdaptiveworkAdapter, p: QueryParams) => Promise<{ id: string }[]>

const LISTS: Array<[string, TypeName, Lister]> = [
  ['listProjects', 'Project', (a, p) => a.listProjects(CREDS, p)],
  ['listTasks', 'Task', (a, p) => a.listTasks(CREDS, '/Project/p1', p)],
  ['listComments', 'Discussion', (a, p) => a.listComments(CREDS, '/Task/t1', p)],
  ['listUsers', 'User', (a, p) => a.listUsers(CREDS, ORG, p)],
]

function ids(type: TypeName, from: number, n: number): string[] {
  return Array.from({ length: n }, (_, i) => idOf(type, from + i))
}

afterEach(() => vi.clearAllMocks())

describe.each(LISTS)(
  'planview-adaptivework %s pages by paging.from / paging.limit',
  (_n, type, list) => {
    it('N = 2L+1 rows at limit L: pages 1-3 serve every id once, in order, hasMore exact', async () => {
      const L = 40
      fakeClarizen(2 * L + 1)
      const adapter = new PlanviewAdaptiveworkAdapter()
      const served: string[] = []
      const more: Array<boolean | undefined> = []
      for (let page = 1; page <= 3; page++) {
        const params = withPageSink({ page, limit: L })
        served.push(...(await list(adapter, params)).map((r) => r.id))
        more.push(readUpstreamPage(params)?.hasMore)
      }
      expect(served).toEqual(ids(type, 0, 2 * L + 1))
      expect(more).toEqual([true, true, false])
    })

    it('the page-2 request carries paging.from = limit and paging.limit = limit', async () => {
      const { requests } = fakeClarizen(100)
      const adapter = new PlanviewAdaptiveworkAdapter()
      await list(adapter, withPageSink({ page: 1, limit: 30 }))
      await list(adapter, withPageSink({ page: 2, limit: 30 }))
      expect(requests.map((r) => r.body['paging'])).toEqual([
        { from: 0, limit: 30 },
        { from: 30, limit: 30 },
      ])
    })

    it('an explicit cursor param is sent as paging.from', async () => {
      const { requests } = fakeClarizen(50)
      const adapter = new PlanviewAdaptiveworkAdapter()
      const params = withPageSink({ page: 1, limit: 5 })
      params['cursor'] = '10'
      const rows = await list(adapter, params)
      expect(requests[0]!.body['paging']).toEqual({ from: 10, limit: 5 })
      expect(rows.map((r) => r.id)).toEqual(ids(type, 10, 5))
    })

    it('API path: parseListQuery + listPage walks the whole collection once', async () => {
      fakeClarizen(230)
      const adapter = new PlanviewAdaptiveworkAdapter()
      const served: string[] = []
      for (let page = 1; page < 20; page++) {
        const params = parseListQuery({ limit: '25', page: String(page) })
        const env = listPage(await list(adapter, params), params, 'planview-adaptivework')
        served.push(...env.data.map((r) => r.id))
        if (env.meta.hasMore !== true) break
      }
      expect(served).toEqual(ids(type, 0, 230))
    })
  },
)

describe('planview-adaptivework declares no page maximum', () => {
  // The entityQuery / paging reference documents no maximum `limit`, so none
  // is declared and nothing is clamped: the router's own cap is the only bound.
  it('capabilities.maxPageSize is not declared', () => {
    const adapter = new PlanviewAdaptiveworkAdapter() as { capabilities?: { maxPageSize?: number } }
    expect(adapter.capabilities?.maxPageSize).toBeUndefined()
  })
})

describe('planview-adaptivework listWorkspaces pages its single organization locally', () => {
  it('page 1 serves the org with hasMore false; page 2 is empty', async () => {
    fakeClarizen(0)
    const adapter = new PlanviewAdaptiveworkAdapter()
    const p1 = withPageSink({ page: 1, limit: 10 })
    const p2 = withPageSink({ page: 2, limit: 10 })
    expect((await adapter.listWorkspaces(CREDS, p1)).map((w) => w.id)).toEqual([ORG])
    expect(readUpstreamPage(p1)).toMatchObject({
      totalCount: 1,
      hasMore: false,
      pagedLocally: true,
    })
    expect(await adapter.listWorkspaces(CREDS, p2)).toEqual([])
    expect(readUpstreamPage(p2)).toMatchObject({
      totalCount: 1,
      hasMore: false,
      pagedLocally: true,
    })
  })
})

describe('planview-adaptivework listWorkspaces without a connected organization', () => {
  it('makes no request, serves nothing and reports hasMore false', async () => {
    const { requests } = fakeClarizen(0)
    const adapter = new PlanviewAdaptiveworkAdapter()
    const params = withPageSink({ page: 1, limit: 10 })
    const creds: Credentials = {
      accessToken: 'session-1',
      extra: { baseUrl: CREDS.extra!['baseUrl'] },
    }
    expect(await adapter.listWorkspaces(creds, params)).toEqual([])
    expect(requests).toEqual([])
    expect(readUpstreamPage(params)).toMatchObject({
      totalCount: 0,
      hasMore: false,
      pagedLocally: true,
    })
  })
})

describe('planview-adaptivework sends a whole, positive paging.limit', () => {
  it.each<[string, unknown, number]>([
    ['zero', 0, 200],
    ['non-numeric', 'abc', 200],
    ['fractional', 2.7, 2],
  ])('a %s limit is sent as paging.limit %i', async (_label, limit, sent) => {
    const { requests } = fakeClarizen(10)
    const adapter = new PlanviewAdaptiveworkAdapter()
    const params = { page: 1, limit } as unknown as QueryParams
    await adapter.listProjects(CREDS, params)
    expect(requests[0]!.body['paging']).toEqual({ from: 0, limit: sent })
  })
})

import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  withPageSink,
  readUpstreamPage,
  parseListQuery,
  listPage,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { VivantioClient } from '../../../../../../src/verticals/customer-support/adapters/vivantio/client'
import { VivantioAdapter } from '../../../../../../src/verticals/customer-support/adapters/vivantio/index'

/**
 * Paging against Vivantio's API reference (webservices-na01.vivantio.com/Help):
 *
 * - `POST api/Configuration/UserSelectAll` "Returns all available Users"
 *   (Body Parameters: None) — a SelectResponseOfUser with no RecordCount.
 * - `POST api/Configuration/GroupSelectAll` "Returns all available Groups"
 *   (Body Parameters: None).
 * - `POST api/Ticket/ActionSelectByParentId/{id}` "Returns all the Actions for
 *   a specified Ticket" (Body Parameters: None).
 *
 * None of the three takes a page parameter, so the fake ignores the body and
 * always returns the whole collection; the adapter must slice it locally.
 */

const CREDS = {
  accessToken: 'dXNlcjpwYXNz',
  extra: { apiBaseUrl: 'https://vivantio.example.test' },
} as unknown as Credentials

interface Call {
  path: string
  body: Record<string, unknown> | undefined
}

function fakeVivantio(n: number) {
  const calls: Call[] = []
  const users = Array.from({ length: n }, (_, i) => ({
    Id: 100 + i,
    FullName: `User ${i}`,
    EmailAddress: `u${i}@example.test`,
  }))
  const groups = Array.from({ length: n }, (_, i) => ({ Id: 100 + i, Name: `Group ${i}` }))
  const actions = Array.from({ length: n }, (_, i) => ({
    Id: 100 + i,
    ParentId: 7,
    Notes: `note ${i}`,
    ActionDate: '2026-01-01T00:00:00Z',
  }))
  vi.spyOn(VivantioClient.prototype, 'post').mockImplementation(
    async (path: string, body?: Record<string, unknown>) => {
      calls.push({ path, body })
      if (path === '/Configuration/UserSelectAll')
        return { Results: users, Successful: true } as never
      if (path === '/Configuration/GroupSelectAll')
        return { Results: groups, Successful: true } as never
      if (path.startsWith('/Ticket/ActionSelectByParentId/')) {
        return { Results: actions, Successful: true } as never
      }
      throw new Error(`unexpected path: ${path}`)
    },
  )
  return { calls }
}

afterEach(() => vi.restoreAllMocks())

const adapter = new VivantioAdapter()

type Lister = (params: QueryParams) => Promise<Array<{ id: string }>>

const METHODS: Array<{ name: string; path: string; list: Lister }> = [
  {
    name: 'listUsers',
    path: '/Configuration/UserSelectAll',
    list: (p) => adapter.listUsers(CREDS, p),
  },
  {
    name: 'listTeams',
    path: '/Configuration/GroupSelectAll',
    list: (p) => adapter.listTeams(CREDS, p),
  },
  {
    name: 'listMessages',
    path: '/Ticket/ActionSelectByParentId/7',
    list: (p) => adapter.listMessages(CREDS, '7', p),
  },
]

describe.each(METHODS)('VivantioAdapter.$name pages locally', ({ path, list }) => {
  const L = 3
  const N = 2 * L + 1

  it('serves every row once, in order, across pages 1..3 with exact hasMore', async () => {
    fakeVivantio(N)
    const seen: string[] = []
    const hasMore: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await list(params)
      seen.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => String(100 + i)))
    expect(hasMore).toEqual([true, true, false])
  })

  it('fetches the whole parameterless collection once on page 2 and slices it locally', async () => {
    const { calls } = fakeVivantio(N)
    const params = withPageSink({ page: 2, limit: L })
    await list(params)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.path).toBe(path)
    expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    expect(readUpstreamPage(params)?.totalCount).toBe(N)
  })

  it('serves a limit larger than the collection whole, with no further page', async () => {
    fakeVivantio(N)
    const params = withPageSink({ page: 1, limit: 500 })
    const rows = await list(params)
    expect(rows).toHaveLength(N)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('serves page 2 through parseListQuery and listPage on the API path', async () => {
    fakeVivantio(N)
    const params = parseListQuery(
      { page: '2', limit: String(L) },
      adapter as { capabilities?: { maxPageSize?: number } },
    )
    const env = listPage(await list(params), params, 'vivantio')
    expect(env.data.map((r) => r.id)).toEqual(['103', '104', '105'])
    expect(env.meta.hasMore).toBe(true)
  })
})

describe('VivantioAdapter declares no page maximum', () => {
  // Vivantio's reference documents PageSize on SelectPage with no ceiling,
  // so there is no documented maximum to clamp to.
  it('leaves maxPageSize undeclared', () => {
    const caps = (adapter as { capabilities?: { maxPageSize?: number } }).capabilities
    expect(caps?.maxPageSize).toBeUndefined()
  })
})

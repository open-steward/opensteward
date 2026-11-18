import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  withPageSink,
  readUpstreamPage,
  parseListQuery,
  listPage,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { ChaskiqClient } from '../../../../../../src/verticals/customer-support/adapters/chaskiq/client'
import { ChaskiqAdapter } from '../../../../../../src/verticals/customer-support/adapters/chaskiq/index'

/**
 * Paging against Chaskiq's GraphQL schema (github.com/chaskiq/chaskiq, main):
 *
 * - `app.conversations`, `app.teams` and `conversation.messages` take
 *   `page` / `per` and resolve through Kaminari `.page(page).per(per)`.
 *   Their `meta` is a `Types::JsonType` SCALAR carrying
 *   `{ current_page, next_page, prev_page, total_pages, total_count }` —
 *   `next_page` is Kaminari's, null on the last page. A sub-selection on a
 *   scalar is a GraphQL validation error, so the fake refuses one.
 * - `app.appUsers` and `app.agents` take no arguments and return every row.
 *
 * The fake honours ONLY those parameters.
 */

const CREDS = {
  accessToken: 'tok',
  extra: { appKey: 'app-key', instanceUrl: 'https://chaskiq.example.test' },
} as unknown as Credentials

interface Call {
  query: string
  variables: Record<string, unknown>
}

function kaminari<T>(rows: T[], vars: Record<string, unknown>, defaultPer: number) {
  const page = typeof vars['page'] === 'number' ? vars['page'] : 1
  const per = typeof vars['per'] === 'number' ? vars['per'] : defaultPer
  const totalPages = Math.ceil(rows.length / per)
  return {
    collection: rows.slice((page - 1) * per, page * per),
    meta: {
      current_page: page,
      next_page: page < totalPages ? page + 1 : null,
      prev_page: page > 1 ? page - 1 : null,
      total_pages: totalPages,
      total_count: rows.length,
    },
  }
}

function fakeChaskiq(n: number) {
  const calls: Call[] = []
  const conversations = Array.from({ length: n }, (_, i) => ({
    id: `c${i}`,
    key: `k${i}`,
    state: 'opened',
    created_at: '2026-01-01T00:00:00Z',
  }))
  const parts = Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    created_at: '2026-01-01T00:00:00Z',
    app_user: { id: 'u1', kind: 'agent' },
    message: { text_content: `m${i}` },
  }))
  const teams = Array.from({ length: n }, (_, i) => ({ id: `t${i}`, name: `Team ${i}` }))
  const appUsers = Array.from({ length: n }, (_, i) => ({
    id: `au${i}`,
    email: `u${i}@example.test`,
    kind: 'AppUser',
  }))
  const agents = Array.from({ length: n }, (_, i) => ({
    id: `ag${i}`,
    email: `a${i}@example.test`,
    name: `Agent ${i}`,
  }))

  const spy = vi
    .spyOn(ChaskiqClient.prototype, 'query')
    .mockImplementation(async (query: string, variables?: Record<string, unknown>) => {
      const vars = variables ?? {}
      calls.push({ query, variables: vars })
      if (/meta\s*\{/.test(query)) {
        throw new Error(
          "Chaskiq GraphQL error: Selections can't be made on scalars (field 'meta' returns JsonType)",
        )
      }
      if (query.includes('GetConversations(')) {
        return { app: { conversations: kaminari(conversations, vars, 20) } } as never
      }
      if (query.includes('GetConversationMessages(')) {
        return { app: { conversation: { messages: kaminari(parts, vars, 7) } } } as never
      }
      if (query.includes('GetTeams(')) {
        return { app: { teams: kaminari(teams, vars, 20) } } as never
      }
      if (query.includes('GetAppUsers(')) {
        return { app: { app_users: appUsers } } as never
      }
      if (query.includes('GetAgents(')) {
        return { app: { agents } } as never
      }
      throw new Error(`unexpected query: ${query}`)
    })
  return { calls, spy }
}

afterEach(() => vi.restoreAllMocks())

const adapter = new ChaskiqAdapter()

type Lister = (params: QueryParams) => Promise<Array<{ id: string }>>

const METHODS: Array<{ name: string; prefix: string; list: Lister; paged: boolean }> = [
  {
    name: 'listTickets',
    prefix: 'c',
    list: (p) => adapter.listTickets(CREDS, p),
    paged: true,
  },
  {
    name: 'listMessages',
    prefix: 'p',
    list: (p) => adapter.listMessages(CREDS, 'k1', p),
    paged: true,
  },
  { name: 'listTeams', prefix: 't', list: (p) => adapter.listTeams(CREDS, p), paged: true },
  { name: 'listContacts', prefix: 'au', list: (p) => adapter.listContacts(CREDS, p), paged: false },
  { name: 'listUsers', prefix: 'ag', list: (p) => adapter.listUsers(CREDS, p), paged: false },
]

describe.each(METHODS)('ChaskiqAdapter.$name pages', ({ prefix, list, paged }) => {
  const L = 3
  const N = 2 * L + 1

  it('serves every row once, in order, across pages 1..3 with exact hasMore', async () => {
    fakeChaskiq(N)
    const seen: string[] = []
    const hasMore: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await list(params)
      seen.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => `${prefix}${i}`))
    expect(hasMore).toEqual([true, true, false])
  })

  if (paged) {
    it('sends the documented page and per on page 2', async () => {
      const { calls } = fakeChaskiq(N)
      await list(withPageSink({ page: 2, limit: L }))
      expect(calls).toHaveLength(1)
      expect(calls[0]!.variables['page']).toBe(2)
      expect(calls[0]!.variables['per']).toBe(L)
    })
  } else {
    it('fetches the whole argument-less collection once and slices it locally', async () => {
      const { calls } = fakeChaskiq(N)
      const params = withPageSink({ page: 2, limit: L })
      await list(params)
      expect(calls).toHaveLength(1)
      expect(calls[0]!.variables).toEqual({ key: 'app-key' })
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
    })
  }

  it('serves page 2 through parseListQuery and listPage on the API path', async () => {
    fakeChaskiq(N)
    const params = parseListQuery(
      { page: '2', limit: String(L) },
      adapter as { capabilities?: { maxPageSize?: number } },
    )
    const env = listPage(await list(params), params, 'chaskiq')
    expect(env.data.map((r) => r.id)).toEqual([`${prefix}3`, `${prefix}4`, `${prefix}5`])
    expect(env.meta.hasMore).toBe(true)
  })
})

describe('ChaskiqAdapter.listTickets totals', () => {
  it('reports Kaminari total_count from meta', async () => {
    fakeChaskiq(7)
    const params = withPageSink({ page: 1, limit: 3 })
    await adapter.listTickets(CREDS, params)
    expect(readUpstreamPage(params)?.totalCount).toBe(7)
  })
})

describe('ChaskiqAdapter page number normalisation', () => {
  it('reads a legacy numeric cursor as the page when page is absent', async () => {
    const { calls } = fakeChaskiq(7)
    await adapter.listTickets(CREDS, { cursor: '2', limit: 3 } as QueryParams)
    expect(calls[0]!.variables['page']).toBe(2)
  })

  it.each([
    [2.7, 2],
    [0, 1],
    [-3, 1],
  ])('sends page %s as the GraphQL Int %s', async (page, sent) => {
    const { calls } = fakeChaskiq(7)
    await adapter.listTeams(CREDS, { page, limit: 3 } as QueryParams)
    expect(calls[0]!.variables['page']).toBe(sent)
  })
})

describe('ChaskiqAdapter declares no page maximum', () => {
  // Chaskiq ships no Kaminari max_per_page (no initializer, no model-level
  // max_paginates_per), so there is no documented ceiling to clamp to.
  it('leaves maxPageSize undeclared', () => {
    const caps = (adapter as { capabilities?: { maxPageSize?: number } }).capabilities
    expect(caps?.maxPageSize).toBeUndefined()
  })
})

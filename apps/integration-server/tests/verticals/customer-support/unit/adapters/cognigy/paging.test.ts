/**
 * Cognigy Live Agent list paging.
 *
 * The Live Agent API reference (https://liveagent-trial.cognigy.ai/openapi/swagger.json,
 * linked from https://docs.cognigy.com/live-agent/api) documents:
 *
 *   - GET /conversations: "List all the conversations with pagination", `page`
 *     ("paginate through conversations"), no page size, and `data.meta.all_count`;
 *   - GET /contacts: "Listing all the resolved contacts with pagination (Page size = 15)",
 *     `page` ("The page parameter");
 *   - GET /conversations/{id}/messages: "List all messages of a conversation", no
 *     paging parameter.
 *
 * The fakes below honour ONLY those parameters. The conversations fake pages
 * by 25 (the size is undocumented, so the adapter must not depend on it).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import {
  _resetRowPager,
  listPage,
  parseListQuery,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { CognigyAdapter } from '../../../../../../src/verticals/customer-support/adapters/cognigy/index'

const creds: Credentials = {
  accessToken: 'tok',
  extra: { accountId: '7', baseUrl: 'https://liveagent.example.test' },
}

interface Call {
  path: string
  params: Record<string, unknown>
  token: unknown
}

let calls: Call[] = []
let handler: (path: string, params: Record<string, unknown>, token: unknown) => unknown

beforeEach(() => {
  _resetRowPager()
  calls = []
  vi.spyOn(axios, 'create').mockImplementation((config) => {
    const token = (config?.headers as Record<string, unknown> | undefined)?.['api_access_token']
    return {
      get: async (path: string, cfg?: { params?: Record<string, unknown> }) => {
        const params = { ...(cfg?.params ?? {}) }
        calls.push({ path, params, token })
        return { data: handler(path, params, token) }
      },
    } as unknown as ReturnType<typeof axios.create>
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

function pageOf(n: number, size: number, page: unknown): number[] {
  const p = typeof page === 'number' ? page : Number(page ?? 1)
  const ids = Array.from({ length: n }, (_, i) => i + 1)
  return ids.slice((p - 1) * size, p * size)
}

function conversations(n: number, size = 25) {
  return (_path: string, params: Record<string, unknown>) => ({
    data: {
      meta: { all_count: n, mine_count: 0, unassigned_count: n, assigned_count: 0 },
      payload: pageOf(n, size, params['page']).map((id) => ({
        id,
        status: 'open',
        created_at: 1_700_000_000,
      })),
    },
  })
}

function contacts(n: number) {
  return (_path: string, params: Record<string, unknown>) => ({
    payload: pageOf(n, 15, params['page']).map((id) => ({ id, name: `c${id}` })),
  })
}

function messages(n: number) {
  return () => ({
    payload: Array.from({ length: n }, (_, i) => ({
      id: i + 1,
      content: 'hi',
      created_at: 1_700_000_000,
    })),
  })
}

async function walk(run: (p: QueryParams) => Promise<{ id: string }[]>, limit: number) {
  const ids: string[] = []
  const hasMore: (boolean | undefined)[] = []
  for (const page of [1, 2, 3]) {
    const params = withPageSink({ page, limit })
    const rows = await run(params)
    ids.push(...rows.map((r) => r.id))
    hasMore.push(listPage(rows, params, 'cognigy').meta.hasMore ?? undefined)
  }
  return { ids, hasMore }
}

const range = (n: number) => Array.from({ length: n }, (_, i) => String(i + 1))

describe('cognigy listTickets paging', () => {
  const adapter = new CognigyAdapter()
  const run = (p: QueryParams) => adapter.listTickets(creds, p)

  it('serves every conversation once, in order, across pages of 2L+1 rows', async () => {
    const L = 20
    handler = conversations(2 * L + 1)
    const { ids, hasMore } = await walk(run, L)
    expect(ids).toEqual(range(2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
  })

  it('page 2 requests upstream page=2 with the status filter', async () => {
    handler = conversations(41)
    await run(withPageSink({ page: 2, limit: 20 }))
    const pages = calls.map((c) => c.params['page'])
    expect(pages).toContain(2)
    expect(calls.every((c) => c.params['status'] === 'all')).toBe(true)
  })

  it('stops at data.meta.all_count without requesting an empty page', async () => {
    handler = conversations(41)
    await walk(run, 20)
    expect(Math.max(...calls.map((c) => Number(c.params['page'])))).toBe(2)
  })

  it('does not depend on the undocumented page size', async () => {
    handler = conversations(23, 10)
    const { ids, hasMore } = await walk(run, 11)
    expect(ids).toEqual(range(23))
    expect(hasMore).toEqual([true, true, false])
  })

  it('a limit above the maximum is clamped and serves the whole collection', async () => {
    handler = conversations(60)
    const params = parseListQuery({ limit: '9999' })
    expect(params.limit).toBe(500)
    const rows = await run(params)
    expect(rows.map((r) => r.id)).toEqual(range(60))
    expect(listPage(rows, params, 'cognigy').meta.hasMore).toBe(false)
  })

  it('API path: page 2 through parseListQuery and listPage', async () => {
    handler = conversations(41)
    const params = parseListQuery({ page: '2', limit: '20' })
    const env = listPage(await run(params), params, 'cognigy')
    expect(env.data.map((r) => r.id)).toEqual(range(40).slice(20))
    expect(env.meta.hasMore).toBe(true)
  })
})

describe('cognigy listContacts paging', () => {
  const adapter = new CognigyAdapter()
  const run = (p: QueryParams) => adapter.listContacts(creds, p)

  it('serves every contact once, in order, across pages of 2L+1 rows', async () => {
    const L = 10
    handler = contacts(2 * L + 1)
    const { ids, hasMore } = await walk(run, L)
    expect(ids).toEqual(range(2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
  })

  it('page 2 requests upstream page=2', async () => {
    handler = contacts(21)
    await run(withPageSink({ page: 2, limit: 10 }))
    expect(calls.map((c) => c.params['page'])).toContain(2)
  })

  it('an exact multiple of 15 ends on the empty page after it', async () => {
    handler = contacts(30)
    const { ids, hasMore } = await walk(run, 10)
    expect(ids).toEqual(range(30))
    expect(hasMore).toEqual([true, true, false])
  })

  it('a limit above the maximum is clamped and serves the whole collection', async () => {
    handler = contacts(40)
    const params = parseListQuery({ limit: '9999' })
    expect(params.limit).toBe(500)
    const rows = await run(params)
    expect(rows.map((r) => r.id)).toEqual(range(40))
    expect(listPage(rows, params, 'cognigy').meta.hasMore).toBe(false)
  })

  it('API path: page 2 through parseListQuery and listPage', async () => {
    handler = contacts(21)
    const params = parseListQuery({ page: '2', limit: '10' })
    const env = listPage(await run(params), params, 'cognigy')
    expect(env.data.map((r) => r.id)).toEqual(range(20).slice(10))
    expect(env.meta.hasMore).toBe(true)
  })
})

describe('cognigy listMessages paging', () => {
  const adapter = new CognigyAdapter()
  const run = (p: QueryParams) => adapter.listMessages(creds, '99', p)

  it('serves every message once, in order, across pages of 2L+1 rows', async () => {
    const L = 3
    handler = messages(2 * L + 1)
    const { ids, hasMore } = await walk(run, L)
    expect(ids).toEqual(range(2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
  })

  it('sends no paging parameter, since the endpoint documents none', async () => {
    handler = messages(7)
    await run(withPageSink({ page: 2, limit: 3 }))
    expect(calls).toHaveLength(1)
    expect(calls[0]!.params).toEqual({})
  })

  it('a limit above the maximum is clamped and serves the whole list', async () => {
    handler = messages(12)
    const params = parseListQuery({ limit: '9999' })
    expect(params.limit).toBe(500)
    const rows = await run(params)
    expect(rows).toHaveLength(12)
    expect(listPage(rows, params, 'cognigy').meta.hasMore).toBe(false)
  })

  it('API path: page 2 through parseListQuery and listPage', async () => {
    handler = messages(7)
    const params = parseListQuery({ page: '2', limit: '3' })
    const env = listPage(await run(params), params, 'cognigy')
    expect(env.data.map((r) => r.id)).toEqual(['4', '5', '6'])
    expect(env.meta.hasMore).toBe(true)
  })
})

describe('cognigy paging end signals', () => {
  const adapter = new CognigyAdapter()

  it('tickets params are exactly page and status', async () => {
    handler = conversations(41)
    await adapter.listTickets(creds, withPageSink({ page: 1, limit: 20 }))
    expect(calls.map((c) => c.params)).toEqual([{ page: 1, status: 'all' }])
  })

  it('tickets without data.meta.all_count stop on the first empty page', async () => {
    handler = (_path, params) => ({
      data: {
        payload: pageOf(41, 25, params['page']).map((id) => ({
          id,
          status: 'open',
          created_at: 1,
        })),
      },
    })
    const { ids, hasMore } = await walk((p) => adapter.listTickets(creds, p), 20)
    expect(ids).toEqual(range(41))
    expect(hasMore).toEqual([true, true, false])
    expect(Math.max(...calls.map((c) => Number(c.params['page'])))).toBe(3)
  })

  it('a short contacts page (<15 rows) ends the walk without another request', async () => {
    handler = contacts(21)
    const { ids } = await walk((p) => adapter.listContacts(creds, p), 10)
    expect(ids).toEqual(range(21))
    expect(Math.max(...calls.map((c) => Number(c.params['page'])))).toBe(2)
  })
})

describe('cognigy paging keys are per connection', () => {
  const adapter = new CognigyAdapter()
  // Each connection sees its own rows: ids carry the account and the token.
  const tag = (path: string, token: unknown) =>
    `${/accounts\/([^/]+)/.exec(path)?.[1]}-${String(token)}`

  const cases = [
    {
      name: 'listTickets',
      run: (c: Credentials, p: QueryParams) => adapter.listTickets(c, p),
      data: (path: string, params: Record<string, unknown>, token: unknown) => ({
        data: {
          meta: { all_count: 41 },
          payload: pageOf(41, 25, params['page']).map((id) => ({
            id: `${tag(path, token)}-${id}`,
            status: 'open',
            created_at: 1,
          })),
        },
      }),
    },
    {
      name: 'listContacts',
      run: (c: Credentials, p: QueryParams) => adapter.listContacts(c, p),
      data: (path: string, params: Record<string, unknown>, token: unknown) => ({
        payload: pageOf(41, 15, params['page']).map((id) => ({
          id: `${tag(path, token)}-${id}`,
          name: 'c',
        })),
      }),
    },
  ]

  for (const { name, run, data } of cases) {
    it(`${name}: a second token on the same account walks on its own`, async () => {
      handler = data
      await run(creds, withPageSink({ page: 1, limit: 20 }))
      const other: Credentials = { ...creds, accessToken: 'other' }
      calls = []
      const rows = await run(other, withPageSink({ page: 2, limit: 20 }))
      expect(rows.map((r) => r.id)).toEqual(
        range(40)
          .slice(20)
          .map((i) => `7-other-${i}`),
      )
      expect(calls.length).toBeGreaterThan(0)
      expect(calls.every((c) => c.token === 'other')).toBe(true)
    })

    it(`${name}: a second account under the same token walks on its own`, async () => {
      handler = data
      await run(creds, withPageSink({ page: 1, limit: 20 }))
      const other: Credentials = { ...creds, extra: { ...creds.extra, accountId: '8' } }
      calls = []
      const rows = await run(other, withPageSink({ page: 2, limit: 20 }))
      expect(rows.map((r) => r.id)).toEqual(
        range(40)
          .slice(20)
          .map((i) => `8-tok-${i}`),
      )
      expect(calls.every((c) => c.path.includes('/accounts/8/'))).toBe(true)
    })
  }
})

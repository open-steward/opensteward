import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  withPageSink,
  readUpstreamPage,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { YellowAiAdapter } from '../../../../../../src/verticals/customer-support/adapters/yellow-ai/index'
import { DOC_AGENT, DOC_USER_DETAILS } from './fixtures'

/**
 * Request shapes and paging against Yellow.ai's documented API
 * (the OpenAPI objects behind https://docs.yellow.ai/api/*):
 *
 * - servers: "https://cloud.yellow.ai" (India), "https://r1.cloud.yellow.ai"
 *   (MEA), "https://r3.cloud.yellow.ai" (Singapore), "https://r4.cloud.yellow.ai"
 *   (USA), "https://r5.cloud.yellow.ai" (Europe); securitySchemes ApiKeyAuth
 *   { "in": "header", "name": "x-api-key" }.
 * - Agent chat concurrency: "GET /api/agents/public/v1/agents/concurrency",
 *   one parameter "bot" (query, required), answering { agents: [...] } with
 *   no paging fields.
 * - Get user details: "GET /cdp/api/v1/user/{userId}", query "bot"
 *   (required) plus optional allProperties / properties / userId.
 *
 * The fake honours ONLY those parameters.
 */

const CREDS: Credentials = {
  accessToken: 'key-1',
  extra: { botId: 'x1744276526472', region: 'r0' },
} as Credentials

interface Call {
  baseURL: string | undefined
  headers: Record<string, string>
  path: string
  params: Record<string, unknown> | undefined
}

const L = 3
const N = 2 * L + 1

function fakeYellow(n: number) {
  const calls: Call[] = []
  const agents = Array.from({ length: n }, (_, i) => ({ ...DOC_AGENT, agentId: `agent${i + 1}` }))
  const create = vi.spyOn(axios, 'create').mockImplementation(((cfg: {
    baseURL?: string
    headers?: Record<string, string>
  }) => {
    const get = vi.fn(async (path: string, opts?: { params?: Record<string, unknown> }) => {
      const params = opts?.params
      calls.push({ baseURL: cfg.baseURL, headers: cfg.headers ?? {}, path, params })
      const keys = Object.keys(params ?? {}).sort()
      if (path === '/api/agents/public/v1/agents/concurrency') {
        if (keys.join(',') !== 'bot') throw new Error(`undocumented params ${keys.join(',')}`)
        return { data: { agents } }
      }
      if (path === '/cdp/api/v1/user/12395') {
        if (keys.join(',') !== 'bot') throw new Error(`undocumented params ${keys.join(',')}`)
        return { data: DOC_USER_DETAILS }
      }
      if (path === '/cdp/api/v1/user/empty') {
        // A 200 that carries no `data` object (only the documented `message`).
        return { data: { message: DOC_USER_DETAILS.message } }
      }
      throw new Error(`unexpected path ${path}`)
    })
    return { get } as never
  }) as never)
  return { calls, create }
}

afterEach(() => vi.restoreAllMocks())

const adapter = new YellowAiAdapter()
type Lister = (params: QueryParams) => Promise<Array<{ id: string }>>

async function walk(list: Lister, limit = L) {
  const ids: string[] = []
  const hasMore: Array<boolean | undefined> = []
  for (let page = 1; page <= 10; page++) {
    const params = withPageSink({ page, limit } as QueryParams)
    const rows = await list(params)
    ids.push(...rows.map((r) => r.id))
    const meta = readUpstreamPage(params)
    hasMore.push(meta?.hasMore)
    if (!meta?.hasMore) break
  }
  return { ids, hasMore }
}

describe('yellow-ai client', () => {
  it('targets the documented India server with the x-api-key header', async () => {
    const { calls } = fakeYellow(1)
    await adapter.listUsers(CREDS, withPageSink({ page: 1, limit: L } as QueryParams))
    expect(calls[0]!.baseURL).toBe('https://cloud.yellow.ai')
    expect(calls[0]!.headers['x-api-key']).toBe('key-1')
    expect(calls[0]!.headers).not.toHaveProperty('x-auth-token')
  })

  it('treats a connection with no region as India', async () => {
    const { calls } = fakeYellow(1)
    await adapter.listUsers(
      { accessToken: 'key-1', extra: { botId: 'b' } } as Credentials,
      withPageSink({ page: 1, limit: L } as QueryParams),
    )
    expect(calls[0]!.baseURL).toBe('https://cloud.yellow.ai')
  })

  // The OpenAPI "servers" list: r1 MEA, r2 Indonasia (served at
  // "https://r2.cloud.yellow.ai/cdp/api/v1"; origin used), r3 Singapore,
  // r4 USA, r5 Europe.
  for (const [region, url] of [
    ['r1', 'https://r1.cloud.yellow.ai'],
    ['r2', 'https://r2.cloud.yellow.ai'],
    ['r3', 'https://r3.cloud.yellow.ai'],
    ['r4', 'https://r4.cloud.yellow.ai'],
    ['r5', 'https://r5.cloud.yellow.ai'],
  ] as const) {
    it(`targets the documented ${region} server`, async () => {
      const { calls } = fakeYellow(1)
      await adapter.listUsers(
        { accessToken: 'key-1', extra: { botId: 'b', region } } as Credentials,
        withPageSink({ page: 1, limit: L } as QueryParams),
      )
      expect(calls[0]!.baseURL).toBe(url)
    })
  }

  it('a connection made without a region reaches the India server', async () => {
    const { calls } = fakeYellow(1)
    const creds = await adapter.exchangeCredentials({ apiKey: 'key-1', botId: 'b' })
    await adapter.listUsers(creds, withPageSink({ page: 1, limit: L } as QueryParams))
    expect(calls[0]!.baseURL).toBe('https://cloud.yellow.ai')
    expect(calls[0]!.headers['x-api-key']).toBe('key-1')
  })

  it('refuses a region with no documented server', async () => {
    const { calls } = fakeYellow(1)
    await expect(
      adapter.listUsers(
        { accessToken: 'key-1', extra: { botId: 'b', region: 'r9' } } as Credentials,
        withPageSink({ page: 1, limit: L } as QueryParams),
      ),
    ).rejects.toThrow(/r9/)
    expect(calls).toHaveLength(0)
  })
})

describe('yellow-ai listUsers (Agent chat concurrency)', () => {
  it('sends only bot to the documented path', async () => {
    const { calls } = fakeYellow(1)
    await adapter.listUsers(CREDS, withPageSink({ page: 1, limit: L } as QueryParams))
    expect(calls.map((c) => [c.path, c.params])).toEqual([
      ['/api/agents/public/v1/agents/concurrency', { bot: 'x1744276526472' }],
    ])
  })

  it('slices the unpaged roster: N = 2L+1, every id once, exact hasMore', async () => {
    fakeYellow(N)
    const { ids, hasMore } = await walk((p) => adapter.listUsers(CREDS, p))
    expect(ids).toEqual(Array.from({ length: N }, (_, i) => `agent${i + 1}`))
    expect(new Set(ids).size).toBe(N)
    expect(hasMore).toEqual([true, true, false])
  })

  it('reports hasMore false on an exact multiple of the page size', async () => {
    fakeYellow(2 * L)
    const { ids, hasMore } = await walk((p) => adapter.listUsers(CREDS, p))
    expect(ids).toHaveLength(2 * L)
    expect(hasMore).toEqual([true, false])
  })

  it('getUser reads the agent out of the full roster', async () => {
    fakeYellow(N)
    const user = await adapter.getUser(CREDS, `agent${N}`)
    expect(user.id).toBe(`agent${N}`)
    expect(user.name).toBe('Agent One')
  })

  it('fails the roster rather than inventing an id for an agent without agentId', async () => {
    const { create } = fakeYellow(0)
    create.mockImplementation((() => ({
      get: vi.fn(async () => ({
        data: { agents: [DOC_AGENT, { ...DOC_AGENT, agentId: undefined }] },
      })),
    })) as never)
    await expect(
      adapter.listUsers(CREDS, withPageSink({ page: 1, limit: L } as QueryParams)),
    ).rejects.toThrow(/agentId/)
  })

  it('getUser throws 404 for an agent not in the roster', async () => {
    fakeYellow(1)
    await expect(adapter.getUser(CREDS, 'nobody')).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('yellow-ai getContact (Get user details)', () => {
  it('reads GET /cdp/api/v1/user/{userId} with bot', async () => {
    const { calls } = fakeYellow(0)
    const contact = await adapter.getContact(CREDS, '12395')
    expect(contact.id).toBe('12395')
    expect(contact.email).toBe('test@yellow.com')
    expect(calls.map((c) => [c.path, c.params])).toEqual([
      ['/cdp/api/v1/user/12395', { bot: 'x1744276526472' }],
    ])
  })
})

describe('yellow-ai getContact without data', () => {
  it('throws 404 when the response carries no data object', async () => {
    const { calls } = fakeYellow(0)
    await expect(adapter.getContact(CREDS, 'empty')).rejects.toMatchObject({
      statusCode: 404,
      message: expect.stringMatching(/not found/),
    })
    expect(calls).toHaveLength(1)
  })
})

describe('yellow-ai refusals send no request', () => {
  const page = { page: 1, limit: L } as QueryParams
  const cases: Array<[string, () => Promise<unknown>, RegExp]> = [
    ['listContacts', () => adapter.listContacts(CREDS, page), /Get user details/],
    ['listTickets', () => adapter.listTickets(CREDS, page), /past 30 days/],
    ['getTicket', () => adapter.getTicket(CREDS, 't1'), /"ticket": \{ "type": "object" \}/],
    ['listMessages', () => adapter.listMessages(CREDS, 't1', page), /uid/],
  ]
  for (const [name, call, reason] of cases) {
    it(`${name} throws 501 NOT_SUPPORTED before any request`, async () => {
      const { create } = fakeYellow(N)
      await expect(call()).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
      await expect(call()).rejects.toThrow(reason)
      expect(create).not.toHaveBeenCalled()
    })
  }
})

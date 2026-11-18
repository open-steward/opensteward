import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage, type Credentials } from '@opensteward/shared'
import { SprinklrServiceClient } from '../../../../../../src/verticals/customer-support/adapters/sprinklr-service/client'
import {
  SprinklrServiceAdapter,
  refreshTokenDirect,
} from '../../../../../../src/verticals/customer-support/adapters/sprinklr-service/index'
import { TicketSchema } from '../../../../../../src/verticals/customer-support/schema/ticket'
import { MessageSchema } from '../../../../../../src/verticals/customer-support/schema/message'
import { DOC_CASE, DOC_MESSAGE } from './fixtures'

/**
 * Fakes that honour only what Sprinklr documents:
 * - POST /api/v1/case/search (https://dev.sprinklr.com/v1-case-search):
 *   body {query, filters, paginationInfo: {start, rows, sortKey}, channelType};
 *   response {searchResults: [{universalCaseApiDTO: {id}}], hasMore, totalHits}.
 * - GET /api/v2/case/{caseId} (https://dev.sprinklr.com/read-case-by-case-id):
 *   response {data: case, errors: []}.
 * - GET /api/v2/case/associated-messages?id= (https://dev.sprinklr.com/case-associated-messages):
 *   response {data: [message ids]}, every id, no paging parameter.
 * - POST /api/v2/message/bulk-fetch (https://dev.sprinklr.com/read-messages-bulk):
 *   body is the JSON array of message ids; response {data: [messages], errors: []}.
 */

const CREDS = { accessToken: 'tok', extra: { apiKey: 'k', env: '' } } as unknown as Credentials
const L = 3
const N = 2 * L + 1

const adapter = new SprinklrServiceAdapter({
  clientId: 'id',
  clientSecret: 'secret',
  redirectUri: 'https://example.test/cb',
})

afterEach(() => vi.restoreAllMocks())

interface Call {
  method: string
  path: string
  arg: unknown
}

function fakeSprinklr(opts: { cases?: number; messages?: number } = {}) {
  const calls: Call[] = []
  const caseIds = Array.from({ length: opts.cases ?? 0 }, (_, i) => `case${i}`)
  const msgIds = Array.from({ length: opts.messages ?? 0 }, (_, i) => `msg${i}`)

  vi.spyOn(SprinklrServiceClient.prototype, 'postV1').mockImplementation(async (path, body) => {
    calls.push({ method: 'POST v1', path, arg: body })
    if (path !== '/case/search') throw new Error(`unexpected POST v1 ${path}`)
    const b = body as { paginationInfo?: { start?: number; rows?: number } }
    const start = b.paginationInfo?.start ?? 0
    const rows = b.paginationInfo?.rows
    if (typeof rows !== 'number') throw new Error('rows missing')
    const slice = caseIds.slice(start, start + rows)
    return {
      searchResults: slice.map((id) => ({
        universalCaseApiDTO: { id, subject: 'x' },
        actionTime: 0,
      })),
      timeBasedCursor: 1475083000235,
      hasMore: start + rows < caseIds.length,
      totalHits: caseIds.length,
    } as never
  })
  vi.spyOn(SprinklrServiceClient.prototype, 'get').mockImplementation(async (path, params) => {
    calls.push({ method: 'GET', path, arg: params })
    if (path === '/case/associated-messages') {
      if (!params || Object.keys(params).join() !== 'id') throw new Error('undocumented params')
      return { data: msgIds } as never
    }
    const m = /^\/case\/([^/]+)$/.exec(path)
    if (m && caseIds.includes(m[1]!))
      return { data: { ...DOC_CASE, id: m[1] }, errors: [] } as never
    throw new Error(`unexpected GET ${path}`)
  })
  vi.spyOn(SprinklrServiceClient.prototype, 'post').mockImplementation(async (path, body) => {
    calls.push({ method: 'POST', path, arg: body })
    if (path !== '/message/bulk-fetch' || !Array.isArray(body))
      throw new Error(`unexpected POST ${path}`)
    // Answer in reverse order: the adapter must not rely on response order.
    const data = [...(body as string[])].reverse().map((id) => ({ ...DOC_MESSAGE, messageId: id }))
    return { data, errors: [] } as never
  })
  return { calls }
}

describe('SprinklrServiceAdapter.listTickets (POST /api/v1/case/search + GET /api/v2/case/{caseId})', () => {
  it('sends the documented search body with the caller page as start/rows', async () => {
    const { calls } = fakeSprinklr({ cases: N })
    await adapter.listTickets(CREDS, withPageSink({ page: 2, limit: L }))
    expect(calls[0]).toEqual({
      method: 'POST v1',
      path: '/case/search',
      arg: {
        query: '',
        filters: [{ filterType: 'IN', field: 'channelType', values: ['SPRINKLR'] }],
        paginationInfo: { start: L, rows: L, sortKey: 'caseCreationTime' },
        channelType: 'SPRINKLR',
      },
    })
    expect(calls.slice(1).map((c) => `${c.method} ${c.path}`)).toEqual([
      'GET /case/case3',
      'GET /case/case4',
      'GET /case/case5',
    ])
  })

  it('walks 2L+1 cases over pages 1..3: every id once, hasMore from the platform', async () => {
    fakeSprinklr({ cases: N })
    const seen: string[] = []
    const hasMore: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listTickets(CREDS, params)
      for (const r of rows) TicketSchema.parse(r)
      seen.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => `case${i}`))
    expect(hasMore).toEqual([true, true, false])
  })

  it('reports no hasMore when the platform sends none', async () => {
    vi.spyOn(SprinklrServiceClient.prototype, 'postV1').mockResolvedValue({
      searchResults: [],
    } as never)
    const params = withPageSink({ page: 1, limit: L })
    expect(await adapter.listTickets(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)).toBeUndefined()
  })

  it('throws when a search result has no universalCaseApiDTO.id', async () => {
    vi.spyOn(SprinklrServiceClient.prototype, 'postV1').mockResolvedValue({
      searchResults: [{ universalCaseApiDTO: { id: 'a' } }, { universalCaseApiDTO: {} }],
    } as never)
    const get = vi.spyOn(SprinklrServiceClient.prototype, 'get')
    await expect(adapter.listTickets(CREDS, withPageSink({ page: 1, limit: L }))).rejects.toThrow(
      /result 1 has no universalCaseApiDTO\.id/,
    )
    expect(get).not.toHaveBeenCalled()
  })

  it('throws when the search response has no searchResults', async () => {
    vi.spyOn(SprinklrServiceClient.prototype, 'postV1').mockResolvedValue({ cases: [] } as never)
    await expect(adapter.listTickets(CREDS, withPageSink({ page: 1, limit: L }))).rejects.toThrow(
      /searchResults/,
    )
  })
})

describe('SprinklrServiceAdapter.getTicket (GET /api/v2/case/{caseId})', () => {
  it('reads the documented data envelope', async () => {
    const { calls } = fakeSprinklr({ cases: 1 })
    const t = TicketSchema.parse(await adapter.getTicket(CREDS, 'case0'))
    expect(t.id).toBe('case0')
    expect(calls).toEqual([{ method: 'GET', path: '/case/case0', arg: undefined }])
  })

  it('encodes the case id into the path', async () => {
    const get = vi
      .spyOn(SprinklrServiceClient.prototype, 'get')
      .mockResolvedValue({ data: DOC_CASE, errors: [] } as never)
    await adapter.getTicket(CREDS, 'a/b?c')
    expect(get).toHaveBeenCalledWith('/case/a%2Fb%3Fc')
  })

  it('does not read a bare case outside data', async () => {
    vi.spyOn(SprinklrServiceClient.prototype, 'get').mockResolvedValue(DOC_CASE as never)
    await expect(adapter.getTicket(CREDS, 'x')).rejects.toThrow(/not found/)
  })
})

describe('SprinklrServiceAdapter.listMessages (associated-messages + bulk-fetch)', () => {
  it('asks for the case ids with the documented id parameter and bulk-fetches the page ids', async () => {
    const { calls } = fakeSprinklr({ messages: N })
    await adapter.listMessages(CREDS, 'case-9', withPageSink({ page: 2, limit: L }))
    expect(calls).toEqual([
      { method: 'GET', path: '/case/associated-messages', arg: { id: 'case-9' } },
      { method: 'POST', path: '/message/bulk-fetch', arg: ['msg3', 'msg4', 'msg5'] },
    ])
  })

  it('walks 2L+1 messages over pages 1..3: every id once, in id order, hasMore exact', async () => {
    fakeSprinklr({ messages: N })
    const seen: string[] = []
    const hasMore: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listMessages(CREDS, 'case-9', params)
      for (const r of rows) expect(MessageSchema.parse(r).ticketId).toBe('case-9')
      seen.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => `msg${i}`))
    expect(hasMore).toEqual([true, true, false])
  })

  it('sends no bulk-fetch for a page past the end', async () => {
    const { calls } = fakeSprinklr({ messages: 2 })
    const params = withPageSink({ page: 2, limit: L })
    expect(await adapter.listMessages(CREDS, 'case-9', params)).toEqual([])
    expect(calls.map((c) => c.path)).toEqual(['/case/associated-messages'])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('throws when bulk-fetch has no data array', async () => {
    fakeSprinklr({ messages: 2 })
    vi.spyOn(SprinklrServiceClient.prototype, 'post').mockResolvedValue({ errors: [] } as never)
    await expect(
      adapter.listMessages(CREDS, 'c', withPageSink({ page: 1, limit: L })),
    ).rejects.toThrow(/bulk-fetch response has no data array/)
  })

  it('throws rather than serving a short page when bulk-fetch omits a requested id', async () => {
    fakeSprinklr({ messages: 3 })
    vi.spyOn(SprinklrServiceClient.prototype, 'post').mockResolvedValue({
      data: [
        { ...DOC_MESSAGE, messageId: 'msg0' },
        { ...DOC_MESSAGE, messageId: 'msg2' },
      ],
      errors: [],
    } as never)
    await expect(
      adapter.listMessages(CREDS, 'c', withPageSink({ page: 1, limit: L })),
    ).rejects.toThrow(/no message for 1 of 3 ids: msg1/)
  })

  it('throws when associated-messages has no data array', async () => {
    vi.spyOn(SprinklrServiceClient.prototype, 'get').mockResolvedValue({} as never)
    await expect(
      adapter.listMessages(CREDS, 'c', withPageSink({ page: 1, limit: L })),
    ).rejects.toThrow(/no data array/)
  })
})

describe('SprinklrServiceAdapter.getContact', () => {
  it('refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    const { calls } = fakeSprinklr()
    await expect(adapter.getContact(CREDS, 'acc-1')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(calls).toEqual([])
  })
})

describe('SprinklrServiceClient host', () => {
  it('uses the documented api3.sprinklr.com host, with {env} only when set', () => {
    const create = vi.spyOn(axios, 'create')
    new SprinklrServiceClient(CREDS)
    new SprinklrServiceClient({
      accessToken: 't',
      extra: { apiKey: 'k', env: 'prod2' },
    } as unknown as Credentials)
    expect(create.mock.calls.map((c) => c[0]?.baseURL)).toEqual([
      'https://api3.sprinklr.com/api/v2',
      'https://api3.sprinklr.com/api/v1',
      'https://api3.sprinklr.com/prod2/api/v2',
      'https://api3.sprinklr.com/prod2/api/v1',
    ])
  })
})

describe('SprinklrServiceAdapter OAuth host', () => {
  it('sends the browser to the documented api3.sprinklr.com authorize URL', () => {
    // https://dev.sprinklr.com/getting-started: "https://api3.sprinklr.com/{env}/oauth/authorize?client_id={apikey}&response_type=code&redirect_uri={redirect_uri}"
    expect(adapter.getAuthUrl('st')).toMatch(/^https:\/\/api3\.sprinklr\.com\/oauth\/authorize\?/)
  })

  it('exchanges and refreshes tokens at the documented api3.sprinklr.com token URL', async () => {
    // https://dev.sprinklr.com/getting-started: "https://api3.sprinklr.com/{env}/oauth/token?..."
    const post = vi
      .spyOn(axios, 'post')
      .mockResolvedValue({ data: { access_token: 'a', refresh_token: 'r' } })
    await adapter.exchangeCode('code', 'https://example.test/cb', { apiKey: 'k', env: 'prod2' })
    await adapter.refreshCredentials({
      accessToken: 'a',
      refreshToken: 'r',
      extra: { apiKey: 'k', env: '' },
    } as unknown as Credentials)
    await refreshTokenDirect('r', 'id', 'secret', 'k', 'prod2')
    expect(post.mock.calls.map((c) => c[0])).toEqual([
      'https://api3.sprinklr.com/prod2/oauth/token',
      'https://api3.sprinklr.com/oauth/token',
      'https://api3.sprinklr.com/prod2/oauth/token',
    ])
  })
})

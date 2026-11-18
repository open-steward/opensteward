import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  DEFAULT_PAGE_LIMIT,
  withPageSink,
  readUpstreamPage,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { HelpwiseClient } from '../../../../../../src/verticals/customer-support/adapters/helpwise/client'
import { HelpwiseAdapter } from '../../../../../../src/verticals/customer-support/adapters/helpwise/index'
import { DOC_CONTACT, DOC_CONTACT_GET, DOC_TAG, DOC_TAG_GET } from './fixtures'

/**
 * Request shapes and paging against Helpwise's documented V1 API
 * (https://documenter.getpostman.com/view/29744652/2s9YC5yYKf):
 *
 * - collection variable baseUrl "https://apis.helpwise.io"; auth "the Basic
 *   auth header Basic BASE_64(API_KEY:API_SECRET)".
 * - "GET https://apis.helpwise.io/contacts?limit=<LIMIT>&offset=<OFFSET>",
 *   answering { "nextPage": false, "results": [ ... ] }.
 * - "GET https://apis.helpwise.io/contacts/{{contactId}}".
 * - "GET https://apis.helpwise.io/tags" (a bare array, no parameters) and
 *   "GET https://apis.helpwise.io/tags/{{tagId}}".
 *
 * The fakes honour ONLY those parameters.
 */

const CREDS: Credentials = {
  accessToken: 'key-1',
  extra: { apiSecret: 'secret-1' },
} as Credentials

interface Call {
  path: string
  params: Record<string, unknown> | undefined
}

const L = 3
const N = 2 * L + 1

function fakeHelpwise(n: number) {
  const calls: Call[] = []
  const contacts = Array.from({ length: n }, (_, i) => ({ ...DOC_CONTACT, id: 100 + i }))
  const tags = Array.from({ length: n }, (_, i) => ({ ...DOC_TAG, id: 200 + i }))
  const spy = vi
    .spyOn(HelpwiseClient.prototype, 'get')
    .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      calls.push({ path, params })
      if (path === '/contacts') {
        const p = params ?? {}
        const keys = Object.keys(p).sort()
        if (keys.join(',') !== 'limit,offset')
          throw new Error(`undocumented params ${keys.join(',')}`)
        const limit = p['limit'] as number
        const offset = p['offset'] as number
        const results = contacts.slice(offset, offset + limit)
        return { nextPage: offset + limit < contacts.length, results } as never
      }
      if (path === '/contacts/17864809') return DOC_CONTACT_GET as never
      if (path === '/tags') {
        if (params !== undefined) throw new Error('GET /tags documents no parameters')
        return tags as never
      }
      if (path === '/tags/1') return DOC_TAG_GET as never
      throw new Error(`unexpected path ${path}`)
    })
  return { calls, spy }
}

afterEach(() => vi.restoreAllMocks())

const adapter = new HelpwiseAdapter()
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

describe('helpwise client', () => {
  it('targets the documented V1 host with Basic base64(API_KEY:API_SECRET)', () => {
    const create = vi.spyOn(axios, 'create')
    new HelpwiseClient(CREDS)
    const cfg = create.mock.calls[0]![0]!
    expect(cfg.baseURL).toBe('https://apis.helpwise.io')
    expect((cfg.headers as Record<string, string>)['Authorization']).toBe(
      'Basic ' + Buffer.from('key-1:secret-1').toString('base64'),
    )
  })
})

describe('helpwise listContacts', () => {
  it('walks N = 2L+1 contacts by limit/offset, every id once, hasMore from nextPage', async () => {
    const { calls } = fakeHelpwise(N)
    const { ids, hasMore } = await walk((p) => adapter.listContacts(CREDS, p))
    expect(ids).toEqual(Array.from({ length: N }, (_, i) => String(100 + i)))
    expect(new Set(ids).size).toBe(N)
    expect(hasMore).toEqual([true, true, false])
    expect(calls.map((c) => c.params)).toEqual([
      { limit: L, offset: 0 },
      { limit: L, offset: L },
      { limit: L, offset: 2 * L },
    ])
    expect(calls.every((c) => c.path === '/contacts')).toBe(true)
  })

  it('reports hasMore false on an exact multiple of the page size', async () => {
    fakeHelpwise(2 * L)
    const { ids, hasMore } = await walk((p) => adapter.listContacts(CREDS, p))
    expect(ids).toHaveLength(2 * L)
    expect(hasMore).toEqual([true, false])
  })

  it('sends the shared DEFAULT_PAGE_LIMIT when the caller gives no limit', async () => {
    const { calls } = fakeHelpwise(N)
    await adapter.listContacts(CREDS, withPageSink({} as QueryParams))
    expect(calls.map((c) => c.params)).toEqual([{ limit: DEFAULT_PAGE_LIMIT, offset: 0 }])
  })

  it('getContact reads GET /contacts/{id}', async () => {
    const { calls } = fakeHelpwise(0)
    const c = await adapter.getContact(CREDS, '17864809')
    expect(c.id).toBe('17864809')
    expect(calls).toEqual([{ path: '/contacts/17864809', params: undefined }])
  })
})

describe('helpwise listTags', () => {
  it('slices the unpaged GET /tags array: N = 2L+1, every id once, exact hasMore', async () => {
    const { calls } = fakeHelpwise(N)
    const { ids, hasMore } = await walk((p) => adapter.listTags(CREDS, p))
    expect(ids).toEqual(Array.from({ length: N }, (_, i) => String(200 + i)))
    expect(hasMore).toEqual([true, true, false])
    expect(calls.every((c) => c.path === '/tags' && c.params === undefined)).toBe(true)
  })

  it('getTag reads GET /tags/{id}', async () => {
    const { calls } = fakeHelpwise(0)
    const t = await adapter.getTag(CREDS, '1')
    expect(t.id).toBe('1')
    expect(t.color).toBe('#FF0000')
    expect(calls).toEqual([{ path: '/tags/1', params: undefined }])
  })
})

describe('helpwise refusals send no request', () => {
  const cases: Array<[string, () => Promise<unknown>, RegExp]> = [
    [
      'listTickets',
      () => adapter.listTickets(CREDS, { page: 1, limit: L } as QueryParams),
      /inboxIds/,
    ],
    ['getTicket', () => adapter.getTicket(CREDS, '116851645'), /InboxId/],
    [
      'listMessages',
      () => adapter.listMessages(CREDS, '252409', { page: 1, limit: L } as QueryParams),
      /mailboxId/,
    ],
    [
      'listUsers',
      () => adapter.listUsers(CREDS, { page: 1, limit: L } as QueryParams),
      /mailbox_id/,
    ],
    ['getUser', () => adapter.getUser(CREDS, '204767'), /users\/me/],
    ['listTeams', () => adapter.listTeams(CREDS, { page: 1, limit: L } as QueryParams), /no teams/],
    ['getTeam', () => adapter.getTeam(CREDS, '1'), /no teams/],
  ]
  for (const [name, call, reason] of cases) {
    it(`${name} throws 501 NOT_SUPPORTED before any request`, async () => {
      const { spy } = fakeHelpwise(N)
      const create = vi.spyOn(axios, 'create')
      await expect(call()).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
      await expect(call()).rejects.toThrow(reason)
      expect(spy).not.toHaveBeenCalled()
      expect(create).not.toHaveBeenCalled()
    })
  }
})

describe('helpwise parseWebhookEvents', () => {
  it('maps conversation.created to tickets/created', () => {
    const events = adapter.parseWebhookEvents({ event: 'conversation.created', data: { id: 'c1' } })
    expect(events[0]!.platform).toBe('helpwise')
    expect(events[0]!.resourceType).toBe('tickets')
    expect(events[0]!.action).toBe('created')
    expect(events[0]!.resourceId).toBe('c1')
  })

  it('maps reply.agent to messages/created', () => {
    const events = adapter.parseWebhookEvents({ event: 'reply.agent', data: { id: 'm1' } })
    expect(events[0]!.resourceType).toBe('messages')
    expect(events[0]!.action).toBe('created')
  })

  it('handles unknown events without throwing', () => {
    const events = adapter.parseWebhookEvents({ event: 'unknown.event', data: { id: 'x1' } })
    expect(events).toHaveLength(1)
  })
})

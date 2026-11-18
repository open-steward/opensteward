/**
 * Haptik list methods.
 *
 * GET /integration/external/v2.0/get_chat_history/, from "Get Chat Transcripts v2.0",
 * https://docs.haptik.ai/en_US/developer-guides/what-are-the-different-apis-that-can-be-used-on-conversation-studio
 *
 *   business_id | str(int) | grouped | 1 | Business ID for
 *   user_name | str | grouped | 1 | Haptik user name.
 *   conversation_no | int | true | 1/2 | Conversation number of user's chat.
 *   pxut | str | grouped | 2 | TRACT Packed eXtensible User Token.
 *   limit | str(int) | optional | n/a | Limit on number of messages that the API should return.
 *   response_type | str | optional | n/a | Either json (default) or text.
 *   "Note: All arguments within a group are required."
 *
 * No page, offset or cursor parameter exists, so the adapter fetches the whole
 * transcript (no `limit`) and pages it locally. The fake honours only the
 * documented parameters and enforces the group rule.
 *
 * That page, and the other 612 on docs.haptik.ai, document no way to list or
 * read conversations, agents or teams: those methods refuse with 501 before
 * sending anything.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import {
  listPage,
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import {
  HaptikAdapter,
  parseConversationRef,
} from '../../../../../../src/verticals/customer-support/adapters/haptik/index'
import { MessageSchema } from '../../../../../../src/verticals/customer-support/schema/message'

const creds: Credentials = {
  accessToken: 'tok',
  extra: { clientId: 'cid', baseUrl: 'https://tenant.haptikapi.com' },
}
const TICKET = '1234:ab112468917fgghdebc:2'
const DOCUMENTED = ['business_id', 'user_name', 'conversation_no', 'pxut', 'limit', 'response_type']

interface Call {
  path: string
  params: Record<string, unknown>
}

let calls: Call[] = []
let total = 0
let created: Array<Record<string, unknown>> = []

const ids = () => Array.from({ length: total }, (_, i) => String(1000 + i))

function respond(path: string, params: Record<string, unknown>): unknown {
  if (path !== '/integration/external/v2.0/get_chat_history/')
    throw new Error(`unexpected path ${path}`)
  for (const k of Object.keys(params)) {
    if (!DOCUMENTED.includes(k)) throw new Error(`undocumented param ${k}`)
  }
  const group1 = ['business_id', 'user_name', 'conversation_no'].every(
    (k) => params[k] !== undefined,
  )
  const group2 = ['pxut', 'conversation_no'].every((k) => params[k] !== undefined)
  if (!group1 && !group2) return { error_message: 'Argument group validation: no valid group.' }
  let rows = ids()
  if (params['limit'] !== undefined) rows = rows.slice(0, Number(params['limit']))
  return {
    chat_json: rows.map((id, i) => ({
      text: `m${id}`,
      sender: i % 2 === 0 ? 'user' : 'bot',
      message_id: Number(id),
      timestamp: '06/22/20 07:24:25 AM UTC',
    })),
  }
}

beforeEach(() => {
  calls = []
  total = 0
  created = []
  vi.spyOn(axios, 'create').mockImplementation((cfg) => {
    created.push(cfg as Record<string, unknown>)
    return {
      get: async (path: string, c?: { params?: Record<string, unknown> }) => {
        const params = { ...(c?.params ?? {}) }
        calls.push({ path, params })
        return { data: respond(path, params) }
      },
      post: async (path: string) => {
        calls.push({ path, params: {} })
        throw new Error('unexpected post')
      },
    } as unknown as ReturnType<typeof axios.create>
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

const adapter = new HaptikAdapter()

describe('haptik listMessages request shape', () => {
  it('sends the documented Group 1 arguments from the ticket id, and no limit', async () => {
    total = 3
    await adapter.listMessages(creds, TICKET, withPageSink({ page: 1, limit: 2 }))
    expect(calls).toHaveLength(1)
    expect(calls[0]!.path).toBe('/integration/external/v2.0/get_chat_history/')
    expect(calls[0]!.params).toEqual({
      business_id: '1234',
      user_name: 'ab112468917fgghdebc',
      conversation_no: '2',
      response_type: 'json',
    })
  })

  it('uses the tenant base URL and the documented headers', async () => {
    total = 1
    await adapter.listMessages(creds, TICKET, withPageSink({ page: 1, limit: 2 }))
    expect(created[0]).toMatchObject({
      baseURL: 'https://tenant.haptikapi.com',
      headers: { Authorization: 'Bearer tok', 'client-id': 'cid' },
    })
  })

  it('rows parse with MessageSchema and carry the ticket id', async () => {
    total = 2
    const rows = await adapter.listMessages(creds, TICKET, withPageSink({ page: 1, limit: 10 }))
    for (const r of rows) expect(() => MessageSchema.parse(r)).not.toThrow()
    expect(rows.map((r) => r.ticketId)).toEqual([TICKET, TICKET])
    expect(rows[0]!.authorId).toBe('ab112468917fgghdebc')
  })

  it('a user name containing ":" survives the id split', async () => {
    total = 1
    await adapter.listMessages(creds, '7:a:b:9', withPageSink({ page: 1, limit: 2 }))
    expect(calls[0]!.params).toMatchObject({
      business_id: '7',
      user_name: 'a:b',
      conversation_no: '9',
    })
  })

  it('surfaces the documented error_message when chat_json is absent', async () => {
    vi.restoreAllMocks()
    vi.spyOn(axios, 'create').mockImplementation(
      () =>
        ({
          get: async () => ({ data: { error_message: 'Invalid token' } }),
          post: vi.fn(),
        }) as unknown as ReturnType<typeof axios.create>,
    )
    await expect(
      adapter.listMessages(creds, TICKET, withPageSink({ page: 1, limit: 2 })),
    ).rejects.toThrow(/Invalid token/)
  })

  for (const bad of ['2', 'abc:2', ':user:2', '1234::2', 'x:user:2', '1234:user:x']) {
    it(`refuses ticket id "${bad}" with 501 and sends no request`, async () => {
      await expect(
        adapter.listMessages(creds, bad, withPageSink({ page: 1, limit: 2 })),
      ).rejects.toMatchObject({
        statusCode: 501,
        code: 'NOT_SUPPORTED',
      })
      expect(calls).toHaveLength(0)
    })
  }
})

describe('parseConversationRef', () => {
  it('splits business_id, user_name, conversation_no', () => {
    expect(parseConversationRef(TICKET)).toEqual({
      businessId: '1234',
      userName: 'ab112468917fgghdebc',
      conversationNo: '2',
    })
  })
})

describe('haptik listMessages pages the whole transcript locally', () => {
  async function walk(limit: number) {
    const seen: string[] = []
    const reported: Array<boolean | undefined> = []
    const meta: Array<boolean | null | undefined> = []
    for (const page of [1, 2, 3]) {
      const params: QueryParams = withPageSink({ page, limit })
      const rows = await adapter.listMessages(creds, TICKET, params)
      seen.push(...rows.map((r) => r.id))
      reported.push(readUpstreamPage(params)?.hasMore)
      meta.push(listPage(rows, params, 'haptik').meta.hasMore)
    }
    return { seen, reported, meta }
  }

  it('serves 2L+1 rows once each over pages 1..3, hasMore exact', async () => {
    const L = 4
    total = 2 * L + 1
    const { seen, reported, meta } = await walk(L)
    expect(seen).toEqual(ids())
    expect(reported).toEqual([true, true, false])
    expect(meta).toEqual([true, true, false])
  })

  it('reports the transcript total and pagedLocally', async () => {
    total = 5
    const params = withPageSink({ page: 1, limit: 2 })
    await adapter.listMessages(creds, TICKET, params)
    expect(readUpstreamPage(params)).toMatchObject({ totalCount: 5, pagedLocally: true })
  })
})

describe('haptik refuses what the docs do not provide, before sending anything', () => {
  const refused: Array<[string, () => Promise<unknown>]> = [
    ['listTickets', () => adapter.listTickets(creds, withPageSink({ page: 1, limit: 10 }))],
    ['getTicket', () => adapter.getTicket(creds, TICKET)],
    ['listUsers', () => adapter.listUsers(creds, withPageSink({ page: 1, limit: 10 }))],
    ['getUser', () => adapter.getUser(creds, '235')],
    ['listTeams', () => adapter.listTeams(creds, withPageSink({ page: 1, limit: 10 }))],
    ['getTeam', () => adapter.getTeam(creds, 'Support')],
  ]
  for (const [name, run] of refused) {
    it(`${name} throws 501 NOT_SUPPORTED and sends no request`, async () => {
      await expect(run()).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
      expect(calls).toHaveLength(0)
      expect(created).toHaveLength(0)
    })
  }
})

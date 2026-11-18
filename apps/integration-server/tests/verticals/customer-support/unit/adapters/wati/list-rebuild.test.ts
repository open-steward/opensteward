/**
 * WATI messages and operators, rebuilt on the documented v3 API.
 *
 * docs.wati.io documents:
 *
 *   - the host: "Use `https://live-mt-server.wati.io` as the API host. V3:
 *     `https://live-mt-server.wati.io/api/ext/v3/...` — do not add a tenant ID
 *     to the path." (https://docs.wati.io/reference/introduction.md);
 *   - GET /api/ext/v3/conversations/{target}/messages ("Get messages"):
 *     `page_number` ("Page number (1-based)."), `page_size` ("Number of items
 *     per page (max 100)."), both required, answering `message_list` ("The
 *     list of conversation message"), `page_number` and `page_size` — no total
 *     and no next flag. Each item is a ConversationEventDto whose `event_type`
 *     is "The type of event (e.g., message, ticket, broadcast)."
 *     (https://docs.wati.io/reference/conversations_getmessagesbyconversationid.md);
 *   - no endpoint that lists operators: the index (https://docs.wati.io/llms.txt)
 *     names only "Assign an operator to a conversation" and "Assign User".
 *
 * The fake honours ONLY those parameters: anything else is a 400.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import {
  _resetRowPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type Credentials,
} from '@opensteward/shared'
import { WatiAdapter } from '../../../../../../src/verticals/customer-support/adapters/wati/index'
import { MessageSchema } from '../../../../../../src/verticals/customer-support/schema/message'

const creds: Credentials = {
  accessToken: 'tok',
  extra: { baseUrl: 'https://live-mt-server.wati.io/123456' },
}

const DOC_MAX = 100
const TARGET = '14155552671'

interface Call {
  baseURL: string
  authorization: string
  path: string
  params: Record<string, unknown>
}

let calls: Call[] = []
let events: Array<Record<string, unknown>> = []
/** What the fake serves to a second tenant's token on the same host. */
let eventsB: Array<Record<string, unknown>> = []

/** One documented message row (fields from the "Get messages" example). */
function messageEvent(i: number): Record<string, unknown> {
  return {
    text: `Message ${i}`,
    type: 'text',
    timestamp: '2026-07-14T16:15:38.3978844Z',
    owner: i % 2 === 0,
    status: 'delivered',
    avatar_url: 'https://example.com/avatar.png',
    assigned_id: '6858f59a3374901cc1c8223f',
    operator_name: 'John Doe',
    bot_type: 'regular',
    local_message_id: `local_${i}`,
    id: `m_${i}`,
    created: '2026-07-14T16:15:38.3978836Z',
    conversation_id: '685bd235e6119686e693a093',
    ticket_id: '68aed3c93a050b3c53978463',
    event_type: 'message',
  }
}

/** A non-message conversation event (the documented `event_type` "ticket"). */
function ticketEvent(i: number): Record<string, unknown> {
  return {
    id: `t_${i}`,
    created: '2026-07-14T16:15:38.3978836Z',
    conversation_id: '685bd235e6119686e693a093',
    ticket_id: '68aed3c93a050b3c53978463',
    event_type: 'ticket',
  }
}

/** `n` messages, with a ticket event after every `every` of them (0 = none). */
function stream(n: number, every = 0): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = []
  for (let i = 0; i < n; i++) {
    out.push(messageEvent(i))
    if (every > 0 && (i + 1) % every === 0) out.push(ticketEvent(i))
  }
  return out
}

beforeEach(() => {
  _resetRowPager()
  calls = []
  events = []
  eventsB = []
  vi.spyOn(axios, 'create').mockImplementation((config) => {
    const baseURL = String(config?.baseURL ?? '')
    const authorization = String(
      (config?.headers as Record<string, unknown> | undefined)?.['Authorization'] ?? '',
    )
    return {
      get: async (path: string, opts?: { params?: Record<string, unknown> }) => {
        const q = opts?.params ?? {}
        calls.push({ baseURL, authorization, path, params: q })
        if (path !== `/api/ext/v3/conversations/${TARGET}/messages`) {
          throw new Error(`404: ${path}`)
        }
        const extra = Object.keys(q).filter((k) => k !== 'page_number' && k !== 'page_size')
        if (extra.length > 0) throw new Error(`400: undocumented parameter ${extra.join(',')}`)
        const page = Number(q['page_number'])
        const size = Number(q['page_size'])
        if (!(Number.isInteger(page) && page >= 1)) throw new Error('400: page_number')
        if (!(Number.isInteger(size) && size >= 1 && size <= DOC_MAX))
          throw new Error('400: page_size')
        const start = (page - 1) * size
        const source = authorization === 'Bearer tok-b' ? eventsB : events
        return {
          data: {
            message_list: source.slice(start, start + size),
            page_number: page,
            page_size: size,
          },
        }
      },
    } as unknown as ReturnType<typeof axios.create>
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

const adapter = new WatiAdapter()

describe('wati v3 host', () => {
  it('sends v3 requests to the documented host with no tenant ID in the path', async () => {
    events = stream(1)
    await adapter.listMessages(creds, TARGET, withPageSink({ page: 1, limit: 5 }))
    expect(calls[0]!.baseURL).toBe('https://live-mt-server.wati.io')
    expect(calls[0]!.path).toBe(`/api/ext/v3/conversations/${TARGET}/messages`)
  })
})

describe('wati listMessages', () => {
  it('reads the documented message_list envelope and sends only page_number and page_size', async () => {
    events = stream(3)
    const rows = await adapter.listMessages(creds, TARGET, withPageSink({ page: 1, limit: 10 }))
    expect(rows.map((r) => r.id)).toEqual(['m_0', 'm_1', 'm_2'])
    expect(calls).toHaveLength(1)
    expect(calls[0]!.params).toEqual({ page_number: 1, page_size: DOC_MAX })
    for (const r of rows) MessageSchema.parse(r)
  })

  it('serves only message events, not ticket or other conversation events', async () => {
    events = [messageEvent(0), ticketEvent(0), messageEvent(1)]
    const rows = await adapter.listMessages(creds, TARGET, withPageSink({ page: 1, limit: 10 }))
    expect(rows.map((r) => r.id)).toEqual(['m_0', 'm_1'])
  })

  it('drops broadcast events and events with no event_type', async () => {
    // event_type is "The type of event (e.g., message, ticket, broadcast)." and nullable.
    events = [
      messageEvent(0),
      { ...ticketEvent(1), id: 'b_1', event_type: 'broadcast' },
      { ...ticketEvent(2), id: 'n_2', event_type: null },
      { id: 'u_3', created: '2026-07-14T16:15:38.3978836Z' },
      messageEvent(4),
    ]
    const rows = await adapter.listMessages(creds, TARGET, withPageSink({ page: 1, limit: 10 }))
    expect(rows.map((r) => r.id)).toEqual(['m_0', 'm_4'])
  })

  it('walks 2L+1 messages over uneven upstream pages: every id once, hasMore exact', async () => {
    const L = 40
    const N = 2 * L + 1
    // A ticket event after every 2 messages: upstream page 1 (100 events) holds
    // 67 messages and page 2 holds the other 14 — uneven upstream pages.
    events = stream(N, 2)
    expect(events.length).toBeGreaterThan(DOC_MAX)
    const ids: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listMessages(creds, TARGET, params)
      ids.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(ids).toEqual(Array.from({ length: N }, (_, i) => `m_${i}`))
    expect(new Set(ids).size).toBe(N)
    expect(more).toEqual([true, true, false])
    // Upstream pages 1 and 2, each fetched once across the whole walk.
    expect(calls.map((c) => c.params['page_number'])).toEqual([1, 2])
  })

  it('peeks past a full last upstream page so hasMore is exact', async () => {
    events = stream(DOC_MAX)
    const params = withPageSink({ page: 1, limit: DOC_MAX })
    const rows = await adapter.listMessages(creds, TARGET, params)
    expect(rows).toHaveLength(DOC_MAX)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(calls.map((c) => c.params['page_number'])).toEqual([1, 2])
  })

  it('API path: parseListQuery → listMessages → listPage serves page 2 and reports the end', async () => {
    events = stream(9, 4)
    const p2 = parseListQuery({ page: '2', limit: '4' })
    const env2 = listPage(await adapter.listMessages(creds, TARGET, p2), p2, 'wati')
    expect(env2.data.map((r) => r.id)).toEqual(['m_4', 'm_5', 'm_6', 'm_7'])
    expect(env2.meta.hasMore).toBe(true)

    const p3 = parseListQuery({ page: '3', limit: '4' })
    const env3 = listPage(await adapter.listMessages(creds, TARGET, p3), p3, 'wati')
    expect(env3.data.map((r) => r.id)).toEqual(['m_8'])
    expect(env3.meta.hasMore).toBe(false)
  })

  it('does not share a walk between two conversations', async () => {
    events = stream(3)
    await adapter.listMessages(creds, TARGET, withPageSink({ page: 1, limit: 2 }))
    await expect(
      adapter.listMessages(creds, 'other', withPageSink({ page: 2, limit: 2 })),
    ).rejects.toThrow(/404/)
  })
})

describe('wati listMessages paging key', () => {
  it('does not share a walk between two tenants on the same host', async () => {
    // Both connections sit on the documented host, so only the token tells them apart.
    const credsB: Credentials = {
      accessToken: 'tok-b',
      extra: { baseUrl: 'https://live-mt-server.wati.io/654321' },
    }
    events = stream(4)
    eventsB = [messageEvent(100), messageEvent(101), messageEvent(102), messageEvent(103)]
    const a = await adapter.listMessages(creds, TARGET, withPageSink({ page: 1, limit: 2 }))
    expect(a.map((r) => r.id)).toEqual(['m_0', 'm_1'])
    const b = await adapter.listMessages(credsB, TARGET, withPageSink({ page: 2, limit: 2 }))
    expect(b.map((r) => r.id)).toEqual(['m_102', 'm_103'])
    expect(calls.filter((c) => c.authorization === 'Bearer tok-b')).toHaveLength(1)
  })
})

describe('wati operators have no documented list endpoint', () => {
  it('listUsers refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    await expect(
      adapter.listUsers(creds, withPageSink({ page: 1, limit: 10 })),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(calls).toHaveLength(0)
  })

  it('getUser refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    await expect(adapter.getUser(creds, 'op_1')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(calls).toHaveLength(0)
  })
})

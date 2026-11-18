/**
 * hubspot-service-hub listMessages — the ticket's threads, then their messages.
 *
 * HubSpot's conversations guide
 * (developers.hubspot.com/docs/api-reference/legacy/conversations/guide):
 * "To filter for messages associated with a specific ticket, provide ticket ID
 * as the associatedTicketId query parameter … GET request:
 * https://api.hubspot.com/conversations/v3/conversations/threads?associatedTicketId=12345",
 * and "To get the entire message history, make a GET request to
 * /conversations/v3/conversations/threads/{threadId}/messages".
 *
 * Both lists page forward (Conversations v3 spec, release/22196): `after` is
 * "The paging cursor token of the last successfully read resource will be
 * returned as the `paging.next.after` JSON property of a paged response
 * containing more results", and `limit` is "The maximum number of results to
 * display per page" (the guide caps threads at "The maximum limit is 500").
 *
 * The fake honours ONLY those documented parameters (`associatedTicketId`,
 * `limit`, `after`), rejects anything else, and serves fewer rows than
 * `limit` so upstream pages are uneven and do not line up with caller pages.
 * The ticket's message rows are flattened out of several threads, so the
 * adapter cuts caller pages with pageByRows.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import {
  withPageSink,
  readUpstreamPage,
  _resetRowPager,
  _resetCursorPager,
  type Credentials,
} from '@opensteward/shared'
import { HubspotServiceHubAdapter } from '../../../../../../src/verticals/customer-support/adapters/hubspot-service-hub/index'
import { HubspotServiceHubClient } from '../../../../../../src/verticals/customer-support/adapters/hubspot-service-hub/client'
import { MessageSchema } from '../../../../../../src/verticals/customer-support/schema/message'
import { DOC_INCOMING_MESSAGE } from './fixtures/messages'

const creds = { accessToken: 'at', refreshToken: 'rt' } as Credentials
const adapter = new HubspotServiceHubAdapter({
  clientId: 'id',
  clientSecret: 'secret',
  redirectUri: 'https://x.test/cb',
})

const THREADS = '/conversations/v3/conversations/threads'
const MESSAGES = /^\/conversations\/v3\/conversations\/threads\/(\d+)\/messages$/
/** "The maximum limit is 500." (threads) */
const THREADS_DOC_MAX = 500

interface Call {
  path: string
  params: Record<string, unknown>
}

const encode = (n: number) => Buffer.from(`o:${n}`).toString('base64')
const decode = (after: unknown) => Number(Buffer.from(String(after), 'base64').toString().slice(2))

function thread(id: string) {
  return {
    id,
    createdAt: '2019-11-18T18:47:59.865Z',
    status: 'OPEN',
    archived: false,
    spam: false,
    inboxId: '481939',
    associatedContactId: '1451',
    originalChannelId: '1000',
    originalChannelAccountId: '148662',
  }
}

function message(threadId: string, id: string, type = 'MESSAGE') {
  return type === 'MESSAGE'
    ? { ...DOC_INCOMING_MESSAGE, id, conversationsThreadId: threadId }
    : {
        id,
        conversationsThreadId: threadId,
        createdAt: '2019-11-18T18:50:00.000Z',
        createdBy: 'A-2620022',
        client: { clientType: 'HUBSPOT' },
        senders: [],
        recipients: [],
        archived: false,
        assignedTo: 'A-2620022',
        type,
      }
}

/**
 * `byTicket` maps a ticket id to its threads, each with its message rows.
 * The server hands back at most `serve` rows per page whatever `limit` asks.
 */
function fake(
  byTicket: Record<string, Array<{ id: string; rows: Array<Record<string, unknown>> }>>,
  serve = { threads: 1, messages: 3 },
) {
  const calls: Call[] = []
  vi.spyOn(HubspotServiceHubClient.prototype, 'get').mockImplementation((async (
    p: string,
    params?: Record<string, unknown>,
  ) => {
    const q = params ?? {}
    calls.push({ path: p, params: q })
    const bad = (msg: string) =>
      Object.assign(new Error(`400: ${msg}`), { response: { status: 400 } })
    const limitOf = (max: number) => {
      const limit = Number(q['limit'])
      if (!(Number.isInteger(limit) && limit >= 1 && limit <= max)) throw bad(`limit ${q['limit']}`)
      return limit
    }
    const slice = <T>(rows: T[], limit: number, cap: number) => {
      const offset = q['after'] === undefined ? 0 : decode(q['after'])
      const out = rows.slice(offset, offset + Math.min(limit, cap))
      const end = offset + out.length
      return {
        results: out,
        ...(end < rows.length ? { paging: { next: { after: encode(end) } } } : {}),
      }
    }

    if (p === THREADS) {
      for (const k of Object.keys(q)) {
        if (!['associatedTicketId', 'limit', 'after'].includes(k)) throw bad(`undocumented ${k}`)
      }
      const threads = byTicket[String(q['associatedTicketId'])] ?? []
      return slice(
        threads.map((t) => thread(t.id)),
        limitOf(THREADS_DOC_MAX),
        serve.threads,
      )
    }
    const m = MESSAGES.exec(p)
    if (m) {
      for (const k of Object.keys(q)) {
        if (!['limit', 'after'].includes(k)) throw bad(`undocumented ${k}`)
      }
      const t = Object.values(byTicket)
        .flat()
        .find((x) => x.id === m[1])
      if (!t) throw Object.assign(new Error('404'), { response: { status: 404 } })
      return slice(t.rows, limitOf(Number.MAX_SAFE_INTEGER), serve.messages)
    }
    throw new Error(`unexpected path in test: ${p}`)
  }) as typeof HubspotServiceHubClient.prototype.get)
  return calls
}

/** 11 body messages over two threads, with thread events mixed in. */
function eleven() {
  return {
    '12345': [
      {
        id: '101',
        rows: [
          message('101', 'm0'),
          message('101', 'm1'),
          message('101', 'e0', 'ASSIGNMENT'),
          message('101', 'm2'),
          message('101', 'm3'),
          message('101', 'm4'),
          message('101', 'm5'),
          message('101', 'm6'),
        ],
      },
      {
        id: '202',
        rows: [
          message('202', 'm7'),
          message('202', 'e1', 'THREAD_STATUS_CHANGE'),
          message('202', 'm8'),
          message('202', 'm9'),
          message('202', 'm10'),
        ],
      },
    ],
    '999': [{ id: '303', rows: [message('303', 'other')] }],
  }
}
const ELEVEN = Array.from({ length: 11 }, (_, i) => `m${i}`)

beforeEach(() => {
  _resetRowPager()
  _resetCursorPager()
})
afterEach(() => vi.restoreAllMocks())

describe('hubspot-service-hub listMessages', () => {
  it('pages 1..3 of 2L+1 messages serve every id once, in order, with exact hasMore', async () => {
    const L = 5
    fake(eleven())
    const ids: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const items = await adapter.listMessages(creds, '12345', params)
      ids.push(...items.map((x) => x.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(ids).toEqual(ELEVEN)
    expect(more).toEqual([true, true, false])
  })

  it('a cold page 3 walks the chain rather than repeating page 1', async () => {
    fake(eleven())
    const params = withPageSink({ page: 3, limit: 5 })
    const items = await adapter.listMessages(creds, '12345', params)
    expect(items.map((x) => x.id)).toEqual(['m10'])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('finds threads by the documented associatedTicketId, not the v4 association route', async () => {
    const calls = fake(eleven())
    await adapter.listMessages(creds, '12345', withPageSink({ page: 1, limit: 5 }))
    const threadCalls = calls.filter((c) => c.path === THREADS)
    expect(threadCalls.length).toBeGreaterThan(0)
    for (const c of threadCalls) expect(c.params['associatedTicketId']).toBe('12345')
    expect(calls.every((c) => c.path === THREADS || MESSAGES.test(c.path))).toBe(true)
  })

  it('follows paging.next.after on both the thread list and each message history', async () => {
    const calls = fake(eleven())
    await adapter.listMessages(creds, '12345', withPageSink({ page: 1, limit: 50 }))
    const threadAfters = calls.filter((c) => c.path === THREADS).map((c) => c.params['after'])
    expect(threadAfters).toEqual([undefined, encode(1)])
    const t101 = calls.filter((c) => c.path === `${THREADS}/101/messages`)
    expect(t101.map((c) => c.params['after'])).toEqual([undefined, encode(3), encode(6)])
  })

  it('serves only messages of the requested ticket, with that ticket id', async () => {
    fake(eleven())
    const items = await adapter.listMessages(creds, '999', withPageSink({ page: 1, limit: 5 }))
    expect(items.map((x) => x.id)).toEqual(['other'])
    expect(items[0]!.ticketId).toBe('999')
  })

  it('drops thread events (ASSIGNMENT, THREAD_STATUS_CHANGE) and parses every row', async () => {
    fake(eleven())
    const items = await adapter.listMessages(creds, '12345', withPageSink({ page: 1, limit: 50 }))
    expect(items.map((x) => x.id)).toEqual(ELEVEN)
    for (const m of items) MessageSchema.parse(m)
  })

  it('a ticket with no threads is an empty, finished list and reads no messages', async () => {
    const calls = fake(eleven())
    const params = withPageSink({ page: 1, limit: 5 })
    const items = await adapter.listMessages(creds, '555', params)
    expect(items).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(calls.every((c) => c.path === THREADS)).toBe(true)
  })

  it('an upstream failure surfaces instead of reading as an empty list', async () => {
    vi.spyOn(HubspotServiceHubClient.prototype, 'get').mockRejectedValue(
      Object.assign(new Error('403'), { response: { status: 403 } }),
    )
    await expect(
      adapter.listMessages(creds, '12345', withPageSink({ page: 1, limit: 5 })),
    ).rejects.toThrow('403')
  })

  it("keeps each ticket's pages apart on one connection", async () => {
    fake(eleven())
    await adapter.listMessages(creds, '12345', withPageSink({ page: 1, limit: 5 }))
    const params = withPageSink({ page: 2, limit: 5 })
    const items = await adapter.listMessages(creds, '999', params)
    // Ticket 999 has one message, so its page 2 is empty and finished; it must
    // not replay ticket 12345's walk (m5..m9) under ticket 999's id.
    expect(items).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('refuses a thread list whose paging.next.after repeats instead of looping', async () => {
    let threadCalls = 0
    vi.spyOn(HubspotServiceHubClient.prototype, 'get').mockImplementation((async (p: string) => {
      if (p !== THREADS) throw new Error(`unexpected path in test: ${p}`)
      threadCalls += 1
      if (threadCalls > 5) throw new Error('looped past the repeated cursor')
      return { results: [thread(String(100 + threadCalls))], paging: { next: { after: 'same' } } }
    }) as typeof HubspotServiceHubClient.prototype.get)
    await expect(
      adapter.listMessages(creds, '12345', withPageSink({ page: 1, limit: 5 })),
    ).rejects.toThrow('paging.next.after repeats same')
    expect(threadCalls).toBe(2)
  })

  it('does not share rows across connections', async () => {
    fake(eleven())
    await adapter.listMessages(creds, '12345', withPageSink({ page: 1, limit: 5 }))
    vi.restoreAllMocks()
    const calls = fake({ '12345': [{ id: '404', rows: [message('404', 'x0')] }] })
    const other = { accessToken: 'at2', refreshToken: 'rt2' } as Credentials
    const items = await adapter.listMessages(other, '12345', withPageSink({ page: 2, limit: 5 }))
    expect(items).toEqual([])
    expect(calls.length).toBeGreaterThan(0)
  })
})

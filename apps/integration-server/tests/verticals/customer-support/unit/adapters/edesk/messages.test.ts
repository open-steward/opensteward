import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  withPageSink,
  readUpstreamPage,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { EdeskClient } from '../../../../../../src/verticals/customer-support/adapters/edesk/client'
import { EdeskAdapter } from '../../../../../../src/verticals/customer-support/adapters/edesk/index'
import {
  transformMessage,
  type RawEdeskMessage,
} from '../../../../../../src/verticals/customer-support/adapters/edesk/transform/message'
import { MessageSchema } from '../../../../../../src/verticals/customer-support/schema/message'

/**
 * eDesk documents no list-messages endpoint (https://developers.edesk.com/llms.txt
 * lists only Create/Read/Update/Delete Message). A ticket's messages are the
 * `messages_ids` ("Array of Message Ids") of Read Ticket
 * (https://developers.edesk.com/reference/getticket.md, `GET /tickets/{ticketId}`),
 * each read by Read Message (https://developers.edesk.com/reference/getmessage.md,
 * `GET /messages/{messageId}`). Both respond `{ data: <object> }` (BaseResponse).
 *
 * The fake serves ONLY those two documented paths, takes no query parameters,
 * and wraps each object in `data`.
 */

const CREDS = { accessToken: 'tok' } as unknown as Credentials

/** Built from the documented `Ticket_Item` schema of Read Message. */
function documentedMessage(id: number, ticketId: number): RawEdeskMessage {
  return {
    id,
    external_id: `ext-${id}`,
    subject: 'Where is my order?',
    created_at: '2026-01-15T09:30:00Z',
    from_consumer_id: 555,
    from_user: { id: 123, name: 'John Smith', email: 'agent@company.com' },
    type: 'Message',
    attachments: [{ id: 9, name: 'cat.jpg', mime: 'image/jpeg' }],
    direction: 'Incoming',
    body: 'Hello',
    errors: [],
    ticket_id: ticketId,
  }
}

interface Call {
  path: string
  params: Record<string, unknown> | undefined
}

function fakeEdesk(ticketId: number, n: number) {
  const calls: Call[] = []
  const ids = Array.from({ length: n }, (_, i) => 1000 + i)
  vi.spyOn(EdeskClient.prototype, 'get').mockImplementation(
    async (path: string, params?: Record<string, unknown>) => {
      calls.push({ path, params })
      if (params && Object.keys(params).length > 0) {
        throw new Error(`undocumented query params on ${path}`)
      }
      if (path === `/tickets/${ticketId}`) {
        return { data: { id: ticketId, status: 'Open', messages_ids: ids } } as never
      }
      const m = /^\/messages\/(\d+)$/.exec(path)
      if (m && ids.includes(Number(m[1]))) {
        return { data: documentedMessage(Number(m[1]), ticketId) } as never
      }
      throw new Error(`unexpected path ${path}`)
    },
  )
  return { calls, ids }
}

afterEach(() => vi.restoreAllMocks())

const adapter = new EdeskAdapter()

describe('eDesk transformMessage (documented Ticket_Item)', () => {
  it('parses with the canonical MessageSchema', () => {
    const out = MessageSchema.parse(transformMessage(documentedMessage(7, 42), '42'))
    expect(out).toMatchObject({
      id: '7',
      externalId: '7',
      ticketId: '42',
      authorId: '555',
      authorType: 'contact',
      body: 'Hello',
      type: 'public',
      attachmentCount: 1,
      createdAt: '2026-01-15T09:30:00.000Z',
      platform: 'edesk',
    })
    expect(out.metadata['externalMessageId']).toBe('ext-7')
    expect(out.metadata['direction']).toBe('Incoming')
  })

  it('maps Outgoing to a user author with from_user.id', () => {
    const out = MessageSchema.parse(
      transformMessage({ ...documentedMessage(8, 42), direction: 'Outgoing' }, '42'),
    )
    expect(out.authorType).toBe('user')
    expect(out.authorId).toBe('123')
  })

  it('maps Note to internal and undocumented-meaning types and Other direction to unknown', () => {
    expect(transformMessage({ ...documentedMessage(1, 1), type: 'Note' }, '1').type).toBe(
      'internal',
    )
    const other = MessageSchema.parse(
      transformMessage({ ...documentedMessage(2, 1), type: 'Status', direction: 'Other' }, '1'),
    )
    expect(other.type).toBe('unknown')
    expect(other.authorType).toBe('unknown')
    expect(other.authorId).toBe('')
  })

  it('refuses a zone-less created_at instead of guessing its zone', () => {
    expect(() =>
      transformMessage({ ...documentedMessage(3, 1), created_at: '2023-01-21 14:30:00' }, '1'),
    ).toThrow(/time zone/)
    expect(() => transformMessage({ ...documentedMessage(4, 1), created_at: null }, '1')).toThrow(
      /time zone/,
    )
  })
})

describe('EdeskAdapter.getMessage', () => {
  it('reads GET /messages/{id} and unwraps data, taking ticketId from ticket_id', async () => {
    const { calls } = fakeEdesk(42, 3)
    const out = MessageSchema.parse(await adapter.getMessage(CREDS, '1001'))
    expect(calls.map((c) => c.path)).toEqual(['/messages/1001'])
    expect(out.id).toBe('1001')
    expect(out.ticketId).toBe('42')
  })

  it('throws when the message carries no ticket_id', async () => {
    vi.spyOn(EdeskClient.prototype, 'get').mockResolvedValue({
      data: { ...documentedMessage(5, 1), ticket_id: undefined },
    } as never)
    await expect(adapter.getMessage(CREDS, '5')).rejects.toThrow(/no ticket_id/)
  })

  it('throws 502 UPSTREAM_SHAPE when Read Message returns no data envelope', async () => {
    vi.spyOn(EdeskClient.prototype, 'get').mockResolvedValue({} as never)
    await expect(adapter.getMessage(CREDS, '5')).rejects.toMatchObject({
      statusCode: 502,
      code: 'UPSTREAM_SHAPE',
      message: expect.stringMatching(/message 5 returned no data/),
    })
  })
})

describe('EdeskAdapter.listMessages', () => {
  it('pages the ticket messages_ids: N = 2L+1, every id once, hasMore exact', async () => {
    const L = 4
    const N = 2 * L + 1
    const { ids } = fakeEdesk(42, N)
    const seen: string[] = []
    const hasMore: boolean[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L } as QueryParams)
      const rows = await adapter.listMessages(CREDS, '42', params)
      for (const r of rows) MessageSchema.parse(r)
      seen.push(...rows.map((r) => r.id))
      const meta = readUpstreamPage(params)
      expect(meta?.totalCount).toBe(N)
      expect(meta?.pagedLocally).toBe(true)
      hasMore.push(meta?.hasMore === true)
      expect(rows.every((r) => r.ticketId === '42')).toBe(true)
    }
    expect(seen).toEqual(ids.map(String))
    expect(new Set(seen).size).toBe(N)
    expect(hasMore).toEqual([true, true, false])
  })

  it('reads the ticket, then only the page’s messages', async () => {
    const { calls } = fakeEdesk(42, 9)
    await adapter.listMessages(CREDS, '42', withPageSink({ page: 2, limit: 4 } as QueryParams))
    expect(calls.map((c) => c.path)).toEqual([
      '/tickets/42',
      '/messages/1004',
      '/messages/1005',
      '/messages/1006',
      '/messages/1007',
    ])
  })

  it('never calls the undocumented /messages list endpoint', async () => {
    const { calls } = fakeEdesk(42, 2)
    await adapter.listMessages(CREDS, '42', withPageSink({ page: 1, limit: 10 } as QueryParams))
    expect(calls.some((c) => c.path === '/messages')).toBe(false)
  })

  it('throws, rather than reporting an empty complete list, when messages_ids is missing', async () => {
    vi.spyOn(EdeskClient.prototype, 'get').mockResolvedValue({
      data: { id: 42, status: 'Open' },
    } as never)
    await expect(
      adapter.listMessages(CREDS, '42', withPageSink({ page: 1, limit: 10 } as QueryParams)),
    ).rejects.toThrow(/messages_ids/)
  })
})

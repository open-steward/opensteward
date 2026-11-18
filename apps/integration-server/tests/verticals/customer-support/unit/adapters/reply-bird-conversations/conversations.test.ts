/**
 * Bird tickets (email threads), their messages, and tags (custom mailbox labels).
 *
 * https://bird.com/openapi.json:
 *   GET /v1/email/threads: "`label` selects the view: the inbox (the default when
 *     omitted), `archive`, `spam`, `blocked`, or any custom label." Query params:
 *     mailbox_id, contact_id, label, has_unread, participant, subject, after, before,
 *     limit (1..100, default 25), starting_after, ending_before.
 *   GET /v1/email/threads/{thread_id}/messages: direction, label, include
 *     (enum ["extracted_text"]), limit, starting_after, ending_before.
 *   GET /v1/email/mailboxes: address, q, state, domain, include_deleted, limit,
 *     starting_after, ending_before.
 *   GET /v1/email/mailboxes/{mailbox_id}/labels: no query params.
 * Lists end on `next_cursor: null`.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import { _resetCursorPager, readUpstreamPage, withPageSink } from '@opensteward/shared'
import { ReplyBirdConversationsAdapter } from '../../../../../../src/verticals/customer-support/adapters/reply-bird-conversations/index'

const CREDS = { accessToken: 'bk_us1_Ab3xKq9mP2wR5tY8uI1oL4n3A3aww' }
const MAX = 100
const PLACEMENTS = ['inbox', 'archive', 'spam', 'blocked']

type Call = { path: string; params: Record<string, unknown> }

const ulid = (prefix: string, i: number) => `${prefix}_${String(i).padStart(26, '0')}`

function thread(i: number, placement: string, mailbox = ulid('mbx', 1)) {
  return {
    id: ulid('thr', i),
    mailbox_id: mailbox,
    channel: 'email',
    contact_id: ulid('con', i),
    subject: `Subject ${i}`,
    participants: ['concierge@inbox.ai'],
    message_count: 1,
    unread_count: 0,
    last_message_at: '2026-05-25T16:42:01Z',
    last_direction: 'inbound',
    labels: [placement],
    created_at: '2026-05-20T09:14:52Z',
    updated_at: '2026-05-25T16:42:01Z',
  }
}

function message(i: number, threadId: string) {
  return {
    id: ulid('rem', i),
    direction: 'inbound',
    channel: 'email',
    thread_id: threadId,
    from: `c${i}@example.com`,
    to: ['concierge@inbox.ai'],
    cc: [],
    delivered_to: null,
    subject: null,
    preview: `p${i}`,
    extracted_text: `text ${i}`,
    labels: ['inbox'],
    status: null,
    authentication: 'unknown',
    spf_pass: null,
    dkim_pass: null,
    dmarc_pass: null,
    attachment_count: 0,
    attachment_manifest: [],
    reference_ids: [],
    contact_id: null,
    recipients: null,
    purge_at: '2027-05-25T16:42:01Z',
    source: {
      resource: `/v1/email/inbound-messages/${ulid('rem', i)}`,
      available_until: '2026-06-24T16:42:01Z',
    },
    occurred_at: '2026-05-25T16:42:01Z',
  }
}

const encode = (o: number) => Buffer.from(`o:${o}`).toString('base64')
const decode = (c: unknown) => Number(Buffer.from(String(c), 'base64').toString('utf8').slice(2))

/** One page of a `_ListEnvelope` list, honouring only `limit` (1..100, default 25) and `starting_after`. */
function listPage<T>(all: T[], params: Record<string, unknown>) {
  const limit = params['limit'] ?? 25
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > MAX)
    throw Object.assign(new Error(`limit must be 1..${MAX}`), { response: { status: 422 } })
  const start = params['starting_after'] === undefined ? 0 : decode(params['starting_after'])
  const data = all.slice(start, start + limit)
  const end = start + data.length
  return {
    data,
    next_cursor: end < all.length ? encode(end) : null,
    prev_cursor: start > 0 ? encode(start) : null,
    refresh_cursor: data.length ? encode(start) : null,
  }
}

function only(params: Record<string, unknown>, allowed: string[]) {
  for (const k of Object.keys(params))
    if (!allowed.includes(k)) throw new Error(`undocumented param ${k}`)
}

interface World {
  threads: ReturnType<typeof thread>[]
  messages: Record<string, ReturnType<typeof message>[]>
  mailboxes: string[]
  labels: Record<string, Array<{ name: string; type: 'system' | 'custom' }>>
}

function fakeBird(world: Partial<World>) {
  const w: World = { threads: [], messages: {}, mailboxes: [], labels: {}, ...world }
  const calls: Call[] = []
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    const params = cfg?.params ?? {}
    calls.push({ path, params })
    if (path === '/v1/email/threads') {
      only(params, [
        'mailbox_id',
        'contact_id',
        'label',
        'has_unread',
        'participant',
        'subject',
        'after',
        'before',
        'limit',
        'starting_after',
        'ending_before',
      ])
      // Documented: an omitted label is the inbox; repeated labels are ANDed.
      const label = params['label'] ?? 'inbox'
      if (Array.isArray(label)) throw new Error('fake: pass one label')
      return {
        data: listPage(
          w.threads.filter((t) => t.labels.includes(String(label))),
          params,
        ),
      }
    }
    let m = /^\/v1\/email\/threads\/([^/]+)$/.exec(path)
    if (m) {
      only(params, [])
      const hit = w.threads.find((t) => t.id === decodeURIComponent(m![1]!))
      if (!hit) throw Object.assign(new Error('not found'), { response: { status: 404 } })
      return { data: hit }
    }
    m = /^\/v1\/email\/threads\/([^/]+)\/messages$/.exec(path)
    if (m) {
      only(params, ['direction', 'label', 'include', 'limit', 'starting_after', 'ending_before'])
      const rows = (w.messages[decodeURIComponent(m[1]!)] ?? []).map((r) =>
        params['include'] === 'extracted_text' ? r : { ...r, extracted_text: undefined },
      )
      return { data: listPage(rows, params) }
    }
    if (path === '/v1/email/mailboxes') {
      only(params, [
        'address',
        'q',
        'state',
        'domain',
        'include_deleted',
        'limit',
        'starting_after',
        'ending_before',
      ])
      return {
        data: listPage(
          w.mailboxes.map((id) => ({ id })),
          params,
        ),
      }
    }
    m = /^\/v1\/email\/mailboxes\/([^/]+)\/labels$/.exec(path)
    if (m) {
      only(params, [])
      return { data: { data: w.labels[decodeURIComponent(m[1]!)] ?? [] } }
    }
    throw new Error(`unexpected GET ${path}`)
  })
  vi.spyOn(axios, 'create').mockImplementation((() => ({ get })) as never)
  return { calls, get }
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

async function walk<T extends { id: string }>(
  call: (params: ReturnType<typeof withPageSink>) => Promise<T[]>,
  pages: number,
  limit: number,
) {
  const seen: string[] = []
  const more: Array<boolean | undefined> = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ page, limit })
    seen.push(...(await call(params)).map((r) => r.id))
    more.push(readUpstreamPage(params)?.hasMore)
  }
  return { seen, more }
}

describe('Bird listTickets', () => {
  it('walks every placement folder: 2L+1 threads over pages 1..3 once each, hasMore exact', async () => {
    const L = 4
    // Uneven folders: 3 in the inbox, none archived, 5 in spam, 1 blocked.
    const threads = [
      ...[1, 2, 3].map((i) => thread(i, 'inbox')),
      ...[4, 5, 6, 7, 8].map((i) => thread(i, 'spam')),
      thread(9, 'blocked'),
    ]
    const { calls } = fakeBird({ threads })
    const adapter = new ReplyBirdConversationsAdapter()
    const { seen, more } = await walk((p) => adapter.listTickets(CREDS, p), 3, L)
    expect(seen).toEqual(threads.map((t) => t.id))
    expect(new Set(seen).size).toBe(2 * L + 1)
    expect(more).toEqual([true, true, false])
    // One label per request, never an unlabelled (inbox-only) call.
    expect(calls.map((c) => c.params['label'])).toEqual(PLACEMENTS)
    for (const c of calls) expect(c.params['limit']).toBe(MAX)
  })

  it('follows next_cursor inside a folder before moving to the next one', async () => {
    const threads = [
      ...Array.from({ length: 150 }, (_, i) => thread(i + 1, 'inbox')),
      thread(151, 'archive'),
    ]
    const { calls } = fakeBird({ threads })
    const params = withPageSink({ page: 2, limit: 100 })
    const rows = await new ReplyBirdConversationsAdapter().listTickets(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(threads.slice(100).map((t) => t.id))
    expect(rows.at(-1)!.status).toBe('closed')
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(calls[1]!.params).toMatchObject({ label: 'inbox', starting_after: encode(100) })
    expect(calls[2]!.params).toEqual({ label: 'archive', limit: MAX })
  })

  it('a page past the end is empty with hasMore false', async () => {
    fakeBird({ threads: [thread(1, 'archive')] })
    const params = withPageSink({ page: 2, limit: 1 })
    expect(await new ReplyBirdConversationsAdapter().listTickets(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('getTicket reads GET /v1/email/threads/{thread_id} back for an id the list returned', async () => {
    const { calls } = fakeBird({ threads: [thread(1, 'inbox')] })
    const adapter = new ReplyBirdConversationsAdapter()
    const [first] = await adapter.listTickets(CREDS, { page: 1, limit: 1 })
    const t = await adapter.getTicket(CREDS, first!.id)
    expect(t).toEqual(first)
    expect(calls.at(-1)!.path).toBe(`/v1/email/threads/${first!.id}`)
  })

  it('keeps separate walks for two connections', async () => {
    const a = { accessToken: 'bk_us1_connectionA' }
    const b = { accessToken: 'bk_us1_connectionB' }
    const { calls } = fakeBird({ threads: [1, 2, 3].map((i) => thread(i, 'inbox')) })
    const adapter = new ReplyBirdConversationsAdapter()
    await adapter.listTickets(a, { page: 1, limit: 1 })
    const before = calls.length
    // Page 2 under B must fetch with B's own requests, not A's remembered rows.
    await adapter.listTickets(b, { page: 2, limit: 1 })
    expect(calls.length).toBeGreaterThan(before)
  })
})

describe('Bird listMessages', () => {
  const T = ulid('thr', 1)

  it('serves 2L+1 messages of a thread over pages 1..3 once each, hasMore exact', async () => {
    const L = 3
    const rows = Array.from({ length: 2 * L + 1 }, (_, i) => message(i + 1, T))
    const { calls } = fakeBird({ messages: { [T]: rows } })
    const adapter = new ReplyBirdConversationsAdapter()
    const { seen, more } = await walk((p) => adapter.listMessages(CREDS, T, p), 3, L)
    expect(seen).toEqual(rows.map((r) => r.id))
    expect(more).toEqual([true, true, false])
    expect(calls.map((c) => c.path)).toEqual(Array(3).fill(`/v1/email/threads/${T}/messages`))
    expect(calls[0]!.params).toEqual({ limit: L, include: 'extracted_text' })
    expect(calls[1]!.params['starting_after']).toBe(encode(L))
  })

  it('asks for the extracted text so the body is the message text', async () => {
    fakeBird({ messages: { [T]: [message(1, T)] } })
    const [m] = await new ReplyBirdConversationsAdapter().listMessages(CREDS, T, {
      page: 1,
      limit: 5,
    })
    expect(m!.body).toBe('text 1')
  })

  it('clamps the page size to 100 and reports the size sent', async () => {
    const { calls } = fakeBird({ messages: { [T]: [message(1, T)] } })
    const params = withPageSink({ page: 1, limit: 250 })
    await new ReplyBirdConversationsAdapter().listMessages(CREDS, T, params)
    expect(calls[0]!.params['limit']).toBe(100)
    expect(readUpstreamPage(params)?.pageSize).toBe(100)
  })
})

describe('Bird listTags / getTag', () => {
  const M1 = ulid('mbx', 1)
  const M2 = ulid('mbx', 2)
  const M3 = ulid('mbx', 3)
  const SYSTEM = ['inbox', 'archive', 'spam', 'blocked', 'sent', 'trash', 'unread'].map((name) => ({
    name,
    type: 'system' as const,
  }))
  const labels = {
    [M1]: [
      ...SYSTEM,
      { name: 'urgent', type: 'custom' as const },
      { name: 'vip', type: 'custom' as const },
    ],
    [M2]: [...SYSTEM],
    [M3]: [
      ...SYSTEM,
      { name: 'a', type: 'custom' as const },
      { name: 'b', type: 'custom' as const },
      { name: 'urgent', type: 'custom' as const },
    ],
  }

  it('serves every custom label of every mailbox, 2L+1 over pages 1..3 once each', async () => {
    const L = 2
    const { calls } = fakeBird({ mailboxes: [M1, M2, M3], labels })
    const adapter = new ReplyBirdConversationsAdapter()
    const { seen, more } = await walk((p) => adapter.listTags(CREDS, p), 3, L)
    expect(seen).toEqual([`${M1}:urgent`, `${M1}:vip`, `${M3}:a`, `${M3}:b`, `${M3}:urgent`])
    expect(more).toEqual([true, true, false])
    expect(calls[0]).toEqual({ path: '/v1/email/mailboxes', params: { limit: MAX } })
    expect(calls.filter((c) => c.path.endsWith('/labels')).map((c) => c.path)).toEqual(
      [M1, M2, M3].map((m) => `/v1/email/mailboxes/${m}/labels`),
    )
  })

  it('pages the mailbox list with starting_after', async () => {
    const boxes = Array.from({ length: 101 }, (_, i) => ulid('mbx', i + 1))
    const { calls } = fakeBird({
      mailboxes: boxes,
      labels: { [boxes[100]!]: [{ name: 'last', type: 'custom' }] },
    })
    const rows = await new ReplyBirdConversationsAdapter().listTags(CREDS, { page: 1, limit: 10 })
    expect(rows.map((r) => r.id)).toEqual([`${boxes[100]}:last`])
    const lists = calls.filter((c) => c.path === '/v1/email/mailboxes')
    expect(lists.map((c) => c.params['starting_after'])).toEqual([undefined, encode(100)])
  })

  it('getTag reads a listed tag back from its mailbox labels, and 404s an unknown one', async () => {
    const { calls } = fakeBird({ mailboxes: [M1], labels })
    const adapter = new ReplyBirdConversationsAdapter()
    const [first] = await adapter.listTags(CREDS, { page: 1, limit: 1 })
    expect(await adapter.getTag(CREDS, first!.id)).toEqual(first)
    expect(calls.at(-1)!.path).toBe(`/v1/email/mailboxes/${M1}/labels`)
    await expect(adapter.getTag(CREDS, `${M1}:inbox`)).rejects.toMatchObject({ statusCode: 404 })
    await expect(adapter.getTag(CREDS, 'urgent')).rejects.toMatchObject({ statusCode: 404 })
  })
})

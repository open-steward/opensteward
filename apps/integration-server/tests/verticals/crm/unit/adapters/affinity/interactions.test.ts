/**
 * Affinity activities: v2 has no /v2/interactions. The spec
 * (https://developer.affinity.co/api-reference/openapi.json, 2026-09-17)
 * lists each kind separately:
 *
 *   GET /v2/emails         "Paginate through all emails in Affinity."
 *   GET /v2/calls          "Paginate through all calls in Affinity."
 *   GET /v2/meetings       "Paginate through all Meetings in Affinity."
 *   GET /v2/chat-messages  "Paginate through all chat messages in Affinity."
 *
 * each with `cursor`, `limit` ("maximum: 100") and `filter`, and
 * `pagination.nextUrl` as the next-page signal. listActivities streams them
 * in that order through the row pager. getActivity reads a meeting from
 * GET /v2/meetings/{meetingId}; the other kinds have no by-id path, so it
 * filters their list by the documented `id` property (`id=1|id=2|id=3`).
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import {
  _resetCursorPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { ActivitySchema } from '../../../../../../src/verticals/crm/schema/activity'
import { AffinityAdapter } from '../../../../../../src/verticals/crm/adapters/affinity/index'

const CREDS = { accessToken: 'affinity_test' }
const MAX = 100

const KINDS = ['email', 'call', 'meeting', 'chat-message'] as const
type Kind = (typeof KINDS)[number]
const PATH: Record<Kind, string> = {
  email: '/v2/emails',
  call: '/v2/calls',
  meeting: '/v2/meetings',
  'chat-message': '/v2/chat-messages',
}

/** `PersonData` and `Attendee` property examples from the spec. */
const PERSON = {
  id: 1,
  firstName: 'Jane',
  lastName: 'Doe',
  primaryEmailAddress: 'jane.smith@northpointvc.com',
  type: 'internal',
}
const ATTENDEE = { emailAddress: 'john.smith@contoso.com', person: PERSON }
const ATTENDEES = { data: [ATTENDEE], totalCount: 200 }
const PERSONS = { data: [PERSON], totalCount: 200 }

/**
 * One record per kind, assembled from the spec's property-level examples (it
 * has no whole-record example for these schemas), id replaced.
 */
function record(kind: Kind, id: number): Record<string, unknown> {
  const at = '2023-01-01T00:00:00Z'
  switch (kind) {
    case 'email':
      return {
        id,
        sentAt: at,
        loggingType: 'automated',
        direction: 'received',
        subject: 'Example subject',
        createdAt: at,
        updatedAt: at,
        from: ATTENDEE,
        toParticipantsPreview: ATTENDEES,
        ccParticipantsPreview: ATTENDEES,
      }
    case 'call':
      return {
        id,
        loggingType: 'manual',
        title: 'Example title',
        startTime: at,
        endTime: at,
        allDay: false,
        creator: ATTENDEE,
        createdAt: at,
        updatedAt: at,
        attendeesPreview: ATTENDEES,
      }
    case 'meeting':
      return {
        id,
        loggingType: 'automated',
        title: 'Example title',
        startTime: at,
        endTime: at,
        allDay: false,
        creator: ATTENDEE,
        organizer: ATTENDEE,
        createdAt: at,
        updatedAt: at,
        attendeesPreview: ATTENDEES,
      }
    case 'chat-message':
      return {
        id,
        sentAt: at,
        loggingType: 'manual',
        direction: 'sent',
        creator: PERSON,
        createdAt: '2022-01-01T00:00:00Z',
        updatedAt: at,
        participantsPreview: PERSONS,
      }
  }
}

/**
 * A fake Affinity v2 serving the four interaction lists, honouring ONLY
 * `cursor`, `limit` (1..100, default 100) and `filter` (`id=<n>`). A cursor is
 * bound to the token and path that minted it. Every kind numbers its rows
 * from 1, as separate id spaces do.
 */
function fakeInteractions(counts: Record<Kind, number>) {
  const sent: URL[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    const token = new Headers(init?.headers).get('authorization') ?? ''
    if ((init?.method ?? 'GET') !== 'GET') return new Response('write', { status: 405 })
    sent.push(url)
    const byId = /^\/v2\/meetings\/(\d+)$/.exec(url.pathname)
    if (byId) {
      const id = Number(byId[1])
      if (id > counts.meeting) return new Response('not found', { status: 404 })
      return Response.json(record('meeting', id))
    }
    const kind = KINDS.find((k) => PATH[k] === url.pathname)
    if (!kind) return new Response(`unexpected ${url.pathname}`, { status: 404 })
    for (const k of url.searchParams.keys()) {
      if (!['cursor', 'limit', 'filter'].includes(k)) {
        return new Response(`unknown param ${k}`, { status: 400 })
      }
    }
    const filter = url.searchParams.get('filter')
    if (filter !== null) {
      const m = /^id=(\d+)$/.exec(filter)
      if (!m) return new Response(`bad filter ${filter}`, { status: 400 })
      const id = Number(m[1])
      const data = id >= 1 && id <= counts[kind] ? [record(kind, id)] : []
      return Response.json({ data, pagination: { prevUrl: null, nextUrl: null } })
    }
    const rawLimit = url.searchParams.get('limit')
    const limit = rawLimit === null ? MAX : Number(rawLimit)
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX) {
      return new Response(`limit must be 1..${MAX}`, { status: 400 })
    }
    const cursor = url.searchParams.get('cursor')
    let offset = 0
    if (cursor !== null) {
      const [ct, cp, co] = Buffer.from(cursor, 'base64url').toString().split('|')
      if (ct !== token || cp !== url.pathname) {
        return new Response('cursor from another connection or collection', { status: 400 })
      }
      offset = Number(co)
    }
    const total = counts[kind]
    const data = Array.from({ length: Math.max(0, Math.min(limit, total - offset)) }, (_, i) =>
      record(kind, offset + i + 1),
    )
    const end = offset + limit
    const nextUrl =
      end < total
        ? `https://api.affinity.co${url.pathname}?cursor=${Buffer.from(`${token}|${url.pathname}|${end}`).toString('base64url')}&limit=${limit}`
        : null
    return Response.json({ data, pagination: { prevUrl: null, nextUrl } })
  })
  return { sent }
}

/** The ids the merged stream should serve, in order. */
function expected(counts: Record<Kind, number>): string[] {
  return KINDS.flatMap((k) => Array.from({ length: counts[k] }, (_, i) => `${k}:${i + 1}`))
}

async function walk(counts: Record<Kind, number>, L: number, pages: number) {
  const seen: string[] = []
  const hasMore: (boolean | undefined)[] = []
  const adapter = new AffinityAdapter()
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ page, limit: L })
    const rows = await adapter.listActivities(CREDS, params)
    for (const r of rows) ActivitySchema.parse(r)
    seen.push(...rows.map((r) => r.id))
    hasMore.push(readUpstreamPage(params)?.hasMore)
  }
  return { seen, hasMore }
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe('affinity listActivities (emails, calls, meetings, chat messages)', () => {
  it('never calls the v1-only /v2/interactions path', async () => {
    const { sent } = fakeInteractions({ email: 1, call: 1, meeting: 1, 'chat-message': 1 })
    await new AffinityAdapter().listActivities(CREDS, withPageSink({ page: 1, limit: 10 }))
    expect(sent.map((u) => u.pathname)).toEqual([
      '/v2/emails',
      '/v2/calls',
      '/v2/meetings',
      '/v2/chat-messages',
    ])
    expect(sent.some((u) => u.pathname.includes('interactions'))).toBe(false)
  })

  it('walks 2L+1 rows across the four kinds: every id once, in order, exact hasMore', async () => {
    const counts = { email: 3, call: 2, meeting: 0, 'chat-message': 6 }
    const { sent } = fakeInteractions(counts)
    const { seen, hasMore } = await walk(counts, 5, 3)
    expect(seen).toEqual(expected(counts))
    expect(seen).toHaveLength(11)
    expect(new Set(seen).size).toBe(11)
    expect(hasMore).toEqual([true, true, false])
    // The upstream page is the documented maximum, not the caller's 5.
    expect(sent.every((u) => u.searchParams.get('limit') === String(MAX))).toBe(true)
  })

  it('cuts caller pages out of uneven upstream pages (100 + 20, 0, 30, 51)', async () => {
    const counts = { email: 120, call: 0, meeting: 30, 'chat-message': 51 }
    const { sent } = fakeInteractions(counts)
    const { seen, hasMore } = await walk(counts, 100, 3)
    expect(seen).toEqual(expected(counts))
    expect(seen).toHaveLength(201)
    expect(hasMore).toEqual([true, true, false])
    // Upstream pages are always the documented maximum, whatever the caller asks.
    expect(sent.every((u) => u.searchParams.get('limit') === String(MAX))).toBe(true)
    // A sequential walk costs one request per upstream page.
    expect(sent.map((u) => u.pathname)).toEqual([
      '/v2/emails',
      '/v2/emails',
      '/v2/calls',
      '/v2/meetings',
      '/v2/chat-messages',
    ])
  })

  it('the second page of a kind carries the cursor from that kind’s nextUrl', async () => {
    const counts = { email: 101, call: 0, meeting: 0, 'chat-message': 0 }
    const { sent } = fakeInteractions(counts)
    await walk(counts, 100, 2)
    const emails = sent.filter((u) => u.pathname === '/v2/emails')
    expect(emails).toHaveLength(2)
    expect(emails[0]!.searchParams.get('cursor')).toBeNull()
    expect(Buffer.from(emails[1]!.searchParams.get('cursor')!, 'base64url').toString()).toBe(
      'Bearer affinity_test|/v2/emails|100',
    )
  })

  it('a page ending exactly on the last row reports hasMore false', async () => {
    const counts = { email: 5, call: 0, meeting: 5, 'chat-message': 0 }
    fakeInteractions(counts)
    const { seen, hasMore } = await walk(counts, 5, 2)
    expect(seen).toEqual(expected(counts))
    expect(hasMore).toEqual([true, false])
  })

  it('page 3 cold walks from the start', async () => {
    const counts = { email: 3, call: 2, meeting: 0, 'chat-message': 6 }
    fakeInteractions(counts)
    const rows = await new AffinityAdapter().listActivities(
      CREDS,
      withPageSink({ page: 3, limit: 5 }),
    )
    expect(rows.map((r) => r.id)).toEqual(['chat-message:6'])
  })

  it('reports meta.hasMore on the API path (parseListQuery → listPage)', async () => {
    fakeInteractions({ email: 3, call: 2, meeting: 0, 'chat-message': 6 })
    const adapter = new AffinityAdapter()
    const p1: QueryParams = parseListQuery({ page: '1', limit: '5' })
    const env1 = listPage(await adapter.listActivities(CREDS, p1), p1, 'affinity')
    expect(env1.data).toHaveLength(5)
    expect(env1.meta.hasMore).toBe(true)
    const p3: QueryParams = parseListQuery({ page: '3', limit: '5' })
    const env3 = listPage(await adapter.listActivities(CREDS, p3), p3, 'affinity')
    expect(env3.data.map((r) => r.id)).toEqual(['chat-message:6'])
    expect(env3.meta.hasMore).toBe(false)
  })

  it('each connection keeps its own walk', async () => {
    // Page 2 at L=100 starts mid-kind, at email:101. token_a's page 1 ends
    // exactly on an upstream page, so its walk has already fetched email rows
    // 101..150 with its own cursor. A pager key shared across connections
    // would hand token_b those rows (or token_a's cursor, which the fake
    // refuses) instead of token_b walking its own emails from the start.
    const counts = { email: 150, call: 0, meeting: 0, 'chat-message': 0 }
    const { sent } = fakeInteractions(counts)
    const a = new AffinityAdapter()
    await a.listActivities({ accessToken: 'token_a' }, withPageSink({ page: 1, limit: 100 }))
    sent.length = 0
    const b = await a.listActivities(
      { accessToken: 'token_b' },
      withPageSink({ page: 2, limit: 100 }),
    )
    expect(b.map((r) => r.id)).toEqual(expected(counts).slice(100))
    // token_b walked from its own start, following only its own cursors.
    expect(sent.map((u) => `${u.pathname}?cursor=${u.searchParams.get('cursor') ?? ''}`)).toEqual([
      '/v2/emails?cursor=',
      `/v2/emails?cursor=${Buffer.from('Bearer token_b|/v2/emails|100').toString('base64url')}`,
      '/v2/calls?cursor=',
      '/v2/meetings?cursor=',
      '/v2/chat-messages?cursor=',
    ])
  })
})

describe('affinity getActivity', () => {
  it('reads a meeting from GET /v2/meetings/{meetingId}', async () => {
    const { sent } = fakeInteractions({ email: 0, call: 0, meeting: 7, 'chat-message': 0 })
    const row = await new AffinityAdapter().getActivity(CREDS, 'meeting:7')
    expect(sent.map((u) => `${u.pathname}${u.search}`)).toEqual(['/v2/meetings/7'])
    expect(ActivitySchema.parse(row)).toMatchObject({ id: 'meeting:7', type: 'meeting' })
  })

  it.each(['email', 'call', 'chat-message'] as const)(
    'reads a %s by filtering its list on the documented id property',
    async (kind) => {
      const { sent } = fakeInteractions({ email: 7, call: 7, meeting: 0, 'chat-message': 7 })
      const row = await new AffinityAdapter().getActivity(CREDS, `${kind}:7`)
      expect(sent).toHaveLength(1)
      expect(sent[0]!.pathname).toBe(PATH[kind])
      expect(sent[0]!.searchParams.get('filter')).toBe('id=7')
      expect(ActivitySchema.parse(row)).toMatchObject({ id: `${kind}:7`, type: kind })
    },
  )

  it('an id the filter does not find is a 404', async () => {
    fakeInteractions({ email: 1, call: 0, meeting: 0, 'chat-message': 0 })
    await expect(new AffinityAdapter().getActivity(CREDS, 'email:9')).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('a row whose id is not the one asked for is a 404, not a wrong record', async () => {
    // Guards against an upstream that ignores the filter and returns the
    // unfiltered list.
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      Response.json({
        data: [record('email', 1)],
        pagination: { prevUrl: null, nextUrl: null },
      }),
    )
    await expect(new AffinityAdapter().getActivity(CREDS, 'email:9')).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it.each(['9', 'interaction:9', 'email:x'])(
    'a malformed id %s is a 404 and sends nothing',
    async (id) => {
      const { sent } = fakeInteractions({ email: 9, call: 9, meeting: 9, 'chat-message': 9 })
      await expect(new AffinityAdapter().getActivity(CREDS, id)).rejects.toMatchObject({
        statusCode: 404,
      })
      expect(sent).toHaveLength(0)
    },
  )
})

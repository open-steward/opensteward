/**
 * ProProfs Help Desk list paging.
 *
 * https://help.proprofsdesk.com/api-retrieve-ticket-list documents
 * POST https://www.proprofsdesk.com/app/api/v1/list/ticket/ with:
 *
 *   "The endpoint URL will return a list of up to 25 ticket details at a time.
 *    If more than 25 tickets are available based on the search parameters, the
 *    response will include links to help you navigate the additional results."
 *   "next_page_link": "https://www.proprofsdesk.com/app/api/v1/list/ticket/?page=2"
 *
 * The request-parameter table has no page-size parameter, so the fake below
 * honours ONLY the `page` query parameter the next_page_link carries (and the
 * documented start_ticket_id / end_ticket_id filters): pages are a fixed 25,
 * and any body `page` or `ticket_per_page` is ignored. Messages come embedded
 * in each ticket, whole.
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
import { ProprofsHelpDeskAdapter } from '../../../../../../src/verticals/customer-support/adapters/proprofs-help-desk/index'

const UPSTREAM = 25
const LINK = 'https://www.proprofsdesk.com/app/api/v1/list/ticket/'

const creds: Credentials = { accessToken: 'tok', extra: { accountEmail: 'a@acme.test' } }

interface Call {
  path: string
  body: Record<string, unknown>
  query: Record<string, unknown>
}

let calls: Call[] = []
let handler: (call: Call) => unknown

beforeEach(() => {
  _resetRowPager()
  calls = []
  vi.spyOn(axios, 'create').mockImplementation(
    () =>
      ({
        post: async (
          path: string,
          body?: Record<string, unknown>,
          cfg?: { params?: Record<string, unknown> },
        ) => {
          const call = { path, body: { ...(body ?? {}) }, query: { ...(cfg?.params ?? {}) } }
          calls.push(call)
          return { data: handler(call) }
        },
      }) as unknown as ReturnType<typeof axios.create>,
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

const range = (n: number) => Array.from({ length: n }, (_, i) => String(i + 1))

function tickets(n: number, prefix = '') {
  return (call: Call) => {
    const page = Math.max(1, Number(call.query['page'] ?? 1))
    const last = Math.max(1, Math.ceil(n / UPSTREAM))
    const ids = range(n).slice((page - 1) * UPSTREAM, page * UPSTREAM)
    return {
      status: 'success',
      ticket_data: {
        first_page_link: LINK,
        previous_page_link: page > 1 ? `${LINK}?page=${page - 1}` : '',
        next_page_link: page < last ? `${LINK}?page=${page + 1}` : '',
        last_page_link: `${LINK}?page=${last}`,
        total_tickets: String(n),
        page,
        total_tickets_on_page: ids.length,
        ticket_per_page: UPSTREAM,
        tickets: ids.map((id) => ({
          ticket_id: `${prefix}${id}`,
          ticket_subject: `t${id}`,
          ticket_status: 'open',
          created_date_time: '2026-01-15 09:30:00',
        })),
      },
    }
  }
}

function ticketWithMessages(ticketId: number, n: number) {
  return (call: Call) => {
    const start = Number(call.body['start_ticket_id'])
    const end = Number(call.body['end_ticket_id'])
    const hit = ticketId >= start && ticketId <= end
    return {
      status: 'success',
      ticket_data: {
        next_page_link: '',
        page: 1,
        tickets: hit
          ? [
              {
                ticket_id: String(ticketId),
                messages: range(n).map((id) => ({
                  id,
                  message_plain_text: `m${id}`,
                  created: '2026-01-15 09:30:00',
                  from: 'a@acme.test',
                  to: 'support@acme.test',
                })),
              },
            ]
          : [],
      },
    }
  }
}

async function walk(run: (p: QueryParams) => Promise<{ id: string }[]>, limit: number) {
  const ids: string[] = []
  const hasMore: (boolean | undefined)[] = []
  for (const page of [1, 2, 3]) {
    const params = withPageSink({ page, limit })
    const rows = await run(params)
    ids.push(...rows.map((r) => r.id))
    hasMore.push(listPage(rows, params, 'proprofs-help-desk').meta.hasMore ?? undefined)
  }
  return { ids, hasMore }
}

describe('proprofs-help-desk listTickets paging', () => {
  const adapter = new ProprofsHelpDeskAdapter()
  const run = (p: QueryParams) => adapter.listTickets(creds, p)

  it('serves every ticket once, in order, across pages of 2L+1 rows', async () => {
    const L = 10
    handler = tickets(2 * L + 1)
    const { ids, hasMore } = await walk(run, L)
    expect(ids).toEqual(range(2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
  })

  it('serves every ticket once when caller pages span upstream pages of 25', async () => {
    const L = 30
    handler = tickets(2 * L + 1)
    const { ids, hasMore } = await walk(run, L)
    expect(ids).toEqual(range(2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
  })

  it('page 2 requests the documented ?page= of the next upstream page', async () => {
    handler = tickets(100)
    await run(withPageSink({ page: 2, limit: 25 }))
    expect(calls.every((c) => c.path === '/list/ticket/')).toBe(true)
    expect(calls.map((c) => c.query['page'])).toContain(2)
  })

  it('an exact multiple of 25 ends on the last page', async () => {
    handler = tickets(50)
    const { ids, hasMore } = await walk(run, 25)
    expect(ids).toEqual(range(50))
    expect(hasMore).toEqual([true, false, false])
  })

  it('a limit above the maximum is clamped and serves the whole collection', async () => {
    handler = tickets(260)
    const params = parseListQuery({ limit: '9999' })
    expect(params.limit).toBe(500)
    const rows = await run(params)
    expect(rows.map((r) => r.id)).toEqual(range(260))
    expect(listPage(rows, params, 'proprofs-help-desk').meta.hasMore).toBe(false)
  })

  it('API path: page 2 through parseListQuery and listPage', async () => {
    handler = tickets(41)
    const params = parseListQuery({ page: '2', limit: '20' })
    const env = listPage(await run(params), params, 'proprofs-help-desk')
    expect(env.data.map((r) => r.id)).toEqual(range(40).slice(20))
    expect(env.meta.hasMore).toBe(true)
  })

  it("keeps one connection's rows away from another token on the same account", async () => {
    const other: Credentials = { accessToken: 'other', extra: { accountEmail: 'a@acme.test' } }
    handler = tickets(100, 'a')
    await adapter.listTickets(creds, withPageSink({ page: 1, limit: 20 }))
    handler = tickets(100, 'b')
    calls = []
    const rows = await adapter.listTickets(other, withPageSink({ page: 2, limit: 20 }))
    expect(rows.map((r) => r.id)).toEqual(
      range(40)
        .slice(20)
        .map((id) => `b${id}`),
    )
    expect(calls.length).toBeGreaterThan(0)
  })

  it('a legacy cursor fetches that upstream page in one request', async () => {
    handler = tickets(100)
    const rows = await run({ cursor: '3', limit: 25 } as QueryParams)
    expect(calls.map((c) => c.query)).toEqual([{ page: 3 }])
    expect(rows.map((r) => r.id)).toEqual(range(75).slice(50))
  })
})

/**
 * A fake whose pages are given explicitly: `pages[n]` is served for ?page=n,
 * with the next_page_link it names. Lets the documented end signal
 * (next_page_link) disagree with the row count.
 */
function scripted(pages: Record<number, { ids: string[]; next: number | null }>) {
  return (call: Call) => {
    const page = Math.max(1, Number(call.query['page'] ?? 1))
    const p = pages[page] ?? { ids: [], next: null }
    return {
      status: 'success',
      ticket_data: {
        next_page_link: p.next === null ? '' : `${LINK}?page=${p.next}`,
        page,
        tickets: p.ids.map((id) => ({
          ticket_id: id,
          ticket_subject: `t${id}`,
          ticket_status: 'open',
          created_date_time: '2026-01-15 09:30:00',
        })),
      },
    }
  }
}

describe('proprofs-help-desk listTickets end signal is next_page_link', () => {
  const adapter = new ProprofsHelpDeskAdapter()
  const run = (p: QueryParams) => adapter.listTickets(creds, p)

  it('a full page of 25 with an empty next_page_link is the end', async () => {
    handler = scripted({ 1: { ids: range(25), next: null } })
    const params = withPageSink({ page: 1, limit: 25 })
    const rows = await run(params)
    expect(rows.map((r) => r.id)).toEqual(range(25))
    expect(listPage(rows, params, 'proprofs-help-desk').meta.hasMore).toBe(false)
    expect(calls.map((c) => c.query['page'])).toEqual([1])
  })

  it('a short page that still carries a next_page_link is followed', async () => {
    handler = scripted({
      1: { ids: range(10), next: 2 },
      2: { ids: range(20).slice(10), next: null },
    })
    const params = withPageSink({ page: 1, limit: 20 })
    const rows = await run(params)
    expect(rows.map((r) => r.id)).toEqual(range(20))
    expect(listPage(rows, params, 'proprofs-help-desk').meta.hasMore).toBe(false)
  })

  it('follows the page number the link names, not current + 1', async () => {
    handler = scripted({
      1: { ids: range(25), next: 3 },
      2: { ids: ['wrong'], next: null },
      3: { ids: range(30).slice(25), next: null },
    })
    const rows = await run(withPageSink({ page: 1, limit: 30 }))
    expect(rows.map((r) => r.id)).toEqual(range(30))
    expect(calls.map((c) => c.query['page'])).toEqual([1, 3])
  })

  it('an empty page that still carries a link ends the walk', async () => {
    handler = scripted({
      1: { ids: range(5), next: 2 },
      2: { ids: [], next: 3 },
      3: { ids: ['never'], next: null },
    })
    const params = withPageSink({ page: 1, limit: 25 })
    const rows = await run(params)
    expect(rows.map((r) => r.id)).toEqual(range(5))
    expect(listPage(rows, params, 'proprofs-help-desk').meta.hasMore).toBe(false)
    expect(calls.map((c) => c.query['page'])).toEqual([1, 2])
  })

  it('a legacy cursor reports hasMore from next_page_link', async () => {
    handler = tickets(100)
    const mid = withPageSink({ cursor: '3', limit: 25 } as QueryParams)
    expect(listPage(await run(mid), mid, 'proprofs-help-desk').meta.hasMore).toBe(true)
    const last = withPageSink({ cursor: '4', limit: 25 } as QueryParams)
    expect(listPage(await run(last), last, 'proprofs-help-desk').meta.hasMore).toBe(false)
  })
})

describe('proprofs-help-desk listMessages paging', () => {
  const adapter = new ProprofsHelpDeskAdapter()
  const run = (p: QueryParams) => adapter.listMessages(creds, '42', p)

  it('serves every embedded message once, in order, across pages of 2L+1 rows', async () => {
    const L = 3
    handler = ticketWithMessages(42, 2 * L + 1)
    const { ids, hasMore } = await walk(run, L)
    expect(ids).toEqual(range(2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
  })

  it('asks for the one ticket by its documented id range', async () => {
    handler = ticketWithMessages(42, 5)
    await run(withPageSink({ page: 2, limit: 2 }))
    expect(calls).toHaveLength(1)
    expect(calls[0]!.body).toMatchObject({ start_ticket_id: 42, end_ticket_id: 42 })
  })

  it('a limit above the maximum is clamped and serves every message', async () => {
    handler = ticketWithMessages(42, 7)
    const params = parseListQuery({ limit: '9999' })
    expect(params.limit).toBe(500)
    const rows = await run(params)
    expect(rows.map((r) => r.id)).toEqual(range(7))
    expect(listPage(rows, params, 'proprofs-help-desk').meta.hasMore).toBe(false)
  })

  it('API path: page 2 through parseListQuery and listPage', async () => {
    handler = ticketWithMessages(42, 5)
    const params = parseListQuery({ page: '2', limit: '2' })
    const env = listPage(await run(params), params, 'proprofs-help-desk')
    expect(env.data.map((r) => r.id)).toEqual(['3', '4'])
    expect(env.meta.hasMore).toBe(true)
  })
})

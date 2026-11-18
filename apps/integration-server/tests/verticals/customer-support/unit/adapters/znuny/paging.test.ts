/**
 * znuny — paging for listTickets and listMessages.
 *
 * GenericTicketConnectorREST's TicketSearch operation has no offset or page
 * parameter. It reads `Limit` and returns the first `Limit` matching
 * TicketIDs (Kernel/GenericInterface/Operation/Ticket/TicketSearch.pm:
 * `$Self->{SearchLimit} = $Param{Data}->{Limit} || $Self->{Config}->{SearchLimit} || 500;`).
 * The adapter used to send an `Offset` that TicketSearch never reads, so
 * page 2 repeated page 1. Page N now asks for the first N × limit IDs and
 * fetches only the last `limit` of them through TicketGet.
 *
 * TicketGet with `AllArticles=1` and no `ArticleLimit` returns every article
 * of the ticket (TicketGet.pm: `ArticleLimit => 5, # Optional`, default 0 =
 * all), so listMessages slices that whole list locally.
 *
 * The fake honours ONLY the documented parameters: `Limit` on TicketSearch,
 * comma-separated TicketIDs on TicketGet, and `AllArticles`/`ArticleLimit`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { ZnunyAdapter } from '../../../../../../src/verticals/customer-support/adapters/znuny/index'
import { ZnunyClient } from '../../../../../../src/verticals/customer-support/adapters/znuny/client'

const creds = {
  accessToken: '',
  extra: { instanceUrl: 'https://helpdesk.example.test', userLogin: 'agent', password: 'pw' },
} as unknown as Credentials

interface Call {
  path: string
  params: Record<string, unknown>
}

/**
 * Fake Znuny: `tickets` ticket rows (TicketID 1000 + i, newest first) and
 * `articles` articles on ticket 1000. TicketSearch reads only `Limit`
 * (absent = the SysConfig default of 500); an `Offset` is ignored, as it is
 * by the real operation.
 */
function fakeZnuny(tickets: number, articles = 0) {
  const calls: Call[] = []
  const ticketIds = Array.from({ length: tickets }, (_, i) => String(1000 + i))
  vi.spyOn(ZnunyClient.prototype, 'get').mockImplementation((async (
    path: string,
    params?: Record<string, unknown>,
  ) => {
    const q = params ?? {}
    calls.push({ path, params: q })
    if (path === '/Ticket') {
      const limit = q['Limit'] === undefined ? 500 : Number(q['Limit'])
      return { TicketID: ticketIds.slice(0, limit) }
    }
    const m = /^\/Ticket\/(.+)$/.exec(path)
    if (!m) throw new Error(`unexpected path in test: ${path}`)
    const ids = m[1]!.split(',')
    return {
      Ticket: ids
        .filter((id) => ticketIds.includes(id))
        .map((id) => {
          const t: Record<string, unknown> = { TicketID: id, State: 'open', StateType: 'open' }
          if (Number(q['AllArticles']) === 1) {
            let list = id === '1000' ? Array.from({ length: articles }, (_, i) => art(i)) : []
            const al = Number(q['ArticleLimit'] ?? 0)
            if (al > 0) list = list.slice(0, al)
            t['Article'] = list
          }
          return t
        }),
    }
  }) as typeof ZnunyClient.prototype.get)
  return calls
}

const art = (i: number) => ({
  ArticleID: `a${i}`,
  Body: `body ${i}`,
  SenderType: 'customer',
  IsVisibleForCustomer: 1,
  Created: '2026-01-15 09:00:00',
})

const adapter = new ZnunyAdapter()

afterEach(() => vi.restoreAllMocks())

describe('znuny listTickets pages by a growing TicketSearch Limit', () => {
  it('pages 1..3 of 2L+1 rows serve every id once, in order, with exact hasMore', async () => {
    const L = 4
    const calls = fakeZnuny(2 * L + 1)
    const ids: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const items = await adapter.listTickets(creds, params)
      ids.push(...items.map((x) => x.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(ids).toEqual(Array.from({ length: 2 * L + 1 }, (_, i) => String(1000 + i)))
    expect(more).toEqual([true, true, false])
    const searches = calls.filter((c) => c.path === '/Ticket')
    expect(searches.map((c) => c.params['Limit'])).toEqual([L, 2 * L, 3 * L])
    // The growing window is only a walk if every search shares one order.
    for (const s of searches) {
      expect(s.params['SortBy']).toBe('Changed')
      expect(s.params['OrderBy']).toBe('Down')
    }
    // TicketGet fetches only the page's IDs.
    const gets = calls.filter((c) => c.path !== '/Ticket').map((c) => c.path)
    expect(gets).toEqual([
      '/Ticket/1000,1001,1002,1003',
      '/Ticket/1004,1005,1006,1007',
      '/Ticket/1008',
    ])
  })

  it('the page-2 request carries the documented `Limit` key, grown by one page', async () => {
    const calls = fakeZnuny(10)
    await adapter.listTickets(creds, withPageSink({ page: 1, limit: 3 }))
    calls.length = 0
    await adapter.listTickets(creds, withPageSink({ page: 2, limit: 3 }))
    const search = calls.find((c) => c.path === '/Ticket')!
    expect(search.params['Limit']).toBe(6)
    expect(search.params).not.toHaveProperty('Offset')
  })

  it('has no documented maximum: a 500-row page asks TicketSearch for exactly 500', async () => {
    // Data.Limit overrides the SearchLimit SysConfig, so there is nothing to
    // clamp to, and the adapter declares no maxPageSize.
    expect(
      (adapter as { capabilities?: { maxPageSize?: number } }).capabilities?.maxPageSize,
    ).toBeUndefined()
    const calls = fakeZnuny(700)
    const params = withPageSink({ page: 1, limit: 500 })
    const items = await adapter.listTickets(creds, params)
    expect(calls[0]!.params['Limit']).toBe(500)
    expect(items).toHaveLength(500)
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('walks through parseListQuery and listPage to the end', async () => {
    const total = 11
    fakeZnuny(total)
    const ids: string[] = []
    const sizes: number[] = []
    for (let n = 1; n < 50; n++) {
      const params = parseListQuery({ limit: '5', page: String(n) })
      const env = listPage(await adapter.listTickets(creds, params), params, 'znuny')
      ids.push(...env.data.map((x) => x.id))
      sizes.push(env.data.length)
      if (env.meta.hasMore !== true) break
    }
    expect(ids).toEqual(Array.from({ length: total }, (_, i) => String(1000 + i)))
    expect(sizes).toEqual([5, 5, 1])
  })

  it('at an exact boundary the full window reads as more, and the next page is empty and final', async () => {
    fakeZnuny(8)
    const p2 = withPageSink({ page: 2, limit: 4 })
    expect(await adapter.listTickets(creds, p2)).toHaveLength(4)
    expect(readUpstreamPage(p2)?.hasMore).toBe(true)
    const p3 = withPageSink({ page: 3, limit: 4 })
    expect(await adapter.listTickets(creds, p3)).toEqual([])
    expect(readUpstreamPage(p3)?.hasMore).toBe(false)
  })
})

describe('znuny listMessages slices the whole article list', () => {
  it('pages 1..3 of 2L+1 articles serve every id once, in order, with exact hasMore', async () => {
    const L = 3
    const calls = fakeZnuny(1, 2 * L + 1)
    const ids: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const items = await adapter.listMessages(creds, '1000', params)
      ids.push(...items.map((x) => x.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
      expect(readUpstreamPage(params)?.totalCount).toBe(2 * L + 1)
    }
    expect(ids).toEqual(Array.from({ length: 2 * L + 1 }, (_, i) => `a${i}`))
    expect(more).toEqual([true, true, false])
    // Every request fetches the whole list: no ArticleLimit truncates it.
    for (const c of calls) {
      expect(c.params['AllArticles']).toBe(1)
      expect(c.params).not.toHaveProperty('ArticleLimit')
    }
  })

  it('walks through parseListQuery and listPage to the end', async () => {
    fakeZnuny(1, 7)
    const ids: string[] = []
    for (let n = 1; n < 50; n++) {
      const params = parseListQuery({ limit: '3', page: String(n) })
      const env = listPage(await adapter.listMessages(creds, '1000', params), params, 'znuny')
      ids.push(...env.data.map((x) => x.id))
      if (env.meta.hasMore !== true) break
    }
    expect(ids).toEqual(Array.from({ length: 7 }, (_, i) => `a${i}`))
  })

  it('an unknown ticket is an empty list', async () => {
    fakeZnuny(1, 3)
    const params = withPageSink({ page: 1, limit: 3 })
    expect(await adapter.listMessages(creds, '9999', params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })
})

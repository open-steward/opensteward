/**
 * Help Scout lists are HAL pages of a fixed size ("paginated to 50 items,
 * with the exception of List Conversation requests, which are paginated to
 * 25 items"), walked by `_links.next.href`, which is absent on the last page.
 * https://developer.helpscout.com/mailbox-api/overview/pagination/
 *
 * The fake below serves exactly that: no size parameter is honoured, and the
 * next link carries `page` plus the first request's filters.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import {
  withPageSink,
  readUpstreamPage,
  _resetRowPager,
  type QueryParams,
} from '@opensteward/shared'
import { HelpScoutAdapter } from '../../../../../../src/verticals/customer-support/adapters/helpscout/index'

const CFG = { clientId: 'id', clientSecret: 'secret', redirectUri: 'http://x/cb' }
const CREDS = { accessToken: 'tok', refreshToken: 'ref' }
const BASE = 'https://api.helpscout.net/v2'

interface Call {
  url: string
  params?: Record<string, unknown>
}

type Row = Record<string, unknown>

function fakeHelpScout(world: Record<string, Row[]>) {
  const calls: Call[] = []
  const get = vi.fn(async (url: string, cfg?: { params?: Record<string, unknown> }) => {
    calls.push({ url, params: cfg?.params })
    let path = url
    let query: Record<string, string> = Object.fromEntries(
      Object.entries(cfg?.params ?? {}).map(([k, v]) => [k, String(v)]),
    )
    if (url.startsWith('https://')) {
      const u = new URL(url)
      path = u.pathname.replace(/^\/v2/, '')
      query = Object.fromEntries(u.searchParams)
    }
    const all = world[path]
    if (!all) throw Object.assign(new Error('404 ' + path), { response: { status: 404 } })
    const size = path === '/conversations' ? 25 : 50
    const page = Number(query['page'] ?? 1)
    const rows = all.slice((page - 1) * size, page * size)
    const key = path.split('/').pop()!
    const more = page * size < all.length
    const next = new URL(BASE + path)
    for (const [k, v] of Object.entries(query)) next.searchParams.set(k, v)
    next.searchParams.set('page', String(page + 1))
    return {
      data: {
        _embedded: { [key]: rows },
        _links: more ? { next: { href: next.toString() } } : {},
        page: {
          size,
          totalElements: all.length,
          totalPages: Math.ceil(all.length / size),
          number: page,
        },
      },
    }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
  return { calls, get }
}

beforeEach(() => _resetRowPager())
afterEach(() => vi.restoreAllMocks())

const conversations = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: 1000 + i,
    subject: 'S' + i,
    status: 'active',
    type: 'email',
    createdAt: '2026-01-01T00:00:00Z',
  }))

const page = (p: number, limit: number, extra: Partial<QueryParams> = {}) =>
  withPageSink({ page: p, limit, ...extra } as QueryParams)

describe('helpscout listTickets', () => {
  it('asks for every status, oldest first, and cuts caller pages out of 25-row upstream pages', async () => {
    const { calls } = fakeHelpScout({ '/conversations': conversations(60) })
    const adapter = new HelpScoutAdapter(CFG)

    const p1 = page(1, 40)
    const first = await adapter.listTickets(CREDS, p1)
    expect(first.map((t) => t.id)).toEqual(conversations(40).map((c) => String(c.id)))
    expect(readUpstreamPage(p1)).toMatchObject({
      hasMore: true,
      pagedLocally: true,
      totalCount: 60,
    })
    expect(calls[0]).toEqual({
      url: '/conversations',
      params: { status: 'all', sortField: 'createdAt', sortOrder: 'asc' },
    })
    expect(calls[1]!.url).toBe(
      BASE + '/conversations?status=all&sortField=createdAt&sortOrder=asc&page=2',
    )

    const p2 = page(2, 40)
    const second = await adapter.listTickets(CREDS, p2)
    expect(second.map((t) => t.id)).toEqual(
      conversations(60)
        .slice(40)
        .map((c) => String(c.id)),
    )
    expect(readUpstreamPage(p2)).toMatchObject({ hasMore: false })
    // No request asks for more rows than a page holds; no size is ever sent.
    for (const c of calls) {
      expect(JSON.stringify(c)).not.toMatch(/limit|size|per_page/)
    }
  })

  it('sends updated_after as modifiedSince in whole seconds', async () => {
    const { calls } = fakeHelpScout({ '/conversations': conversations(1) })
    await new HelpScoutAdapter(CFG).listTickets(
      CREDS,
      page(1, 10, { updatedAfter: new Date('2026-09-01T12:00:03.456Z') }),
    )
    expect(calls[0]!.params).toMatchObject({ modifiedSince: '2026-09-01T12:00:03Z' })
  })

  it('refuses to follow a next link off the API host', async () => {
    const get = vi.fn(async () => ({
      data: {
        _embedded: { conversations: conversations(25) },
        _links: { next: { href: 'https://evil.example/v2/conversations?page=2' } },
      },
    }))
    vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
    await expect(new HelpScoutAdapter(CFG).listTickets(CREDS, page(1, 30))).rejects.toThrow(
      /refusing to follow/,
    )
    expect(get).toHaveBeenCalledTimes(1)
  })
})

describe('helpscout other lists and gets', () => {
  it('lists threads, customers, users, tags and teams on their documented paths', async () => {
    const { calls } = fakeHelpScout({
      '/conversations/77/threads': [
        {
          id: 1,
          type: 'note',
          createdBy: { id: 4, type: 'user' },
          createdAt: '2026-01-01T00:00:00Z',
        },
      ],
      '/customers': [{ id: 2, firstName: 'A', lastName: 'B' }],
      '/users': [{ id: 3, firstName: 'U', email: 'u@acme.com' }],
      '/tags': [{ id: 4, name: 'vip' }],
      '/teams': [{ id: 5, name: 'Eng' }],
    })
    const a = new HelpScoutAdapter(CFG)
    expect((await a.listMessages(CREDS, '77', page(1, 10)))[0]).toMatchObject({
      id: '1',
      ticketId: '77',
      type: 'internal',
    })
    expect(
      (
        await a.listContacts(CREDS, page(1, 10, { updatedAfter: new Date('2026-01-02T00:00:00Z') }))
      )[0],
    ).toMatchObject({ id: '2', name: 'A B' })
    expect((await a.listUsers(CREDS, page(1, 10)))[0]).toMatchObject({
      id: '3',
      email: 'u@acme.com',
    })
    expect((await a.listTags(CREDS, page(1, 10)))[0]).toMatchObject({ id: '4', name: 'vip' })
    expect((await a.listTeams(CREDS, page(1, 10)))[0]).toMatchObject({ id: '5', name: 'Eng' })
    expect(calls.map((c) => c.url)).toEqual([
      '/conversations/77/threads',
      '/customers',
      '/users',
      '/tags',
      '/teams',
    ])
    expect(calls[1]!.params).toEqual({
      sortField: 'createdAt',
      sortOrder: 'asc',
      modifiedSince: '2026-01-02T00:00:00Z',
    })
  })

  it('gets single records by id', async () => {
    const get = vi.fn(async (url: string) => ({
      data: { id: Number(url.split('/').pop()), name: 'n', subject: 's' },
    }))
    vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
    const a = new HelpScoutAdapter(CFG)
    expect((await a.getTicket(CREDS, '123')).id).toBe('123')
    expect((await a.getContact(CREDS, '500')).id).toBe('500')
    expect((await a.getUser(CREDS, '4')).id).toBe('4')
    expect((await a.getTag(CREDS, '9')).id).toBe('9')
    expect(get.mock.calls.map((c) => c[0])).toEqual([
      '/conversations/123',
      '/customers/500',
      '/users/4',
      '/tags/9',
    ])
  })

  it('refuses the undocumented methods with 501 before any request', async () => {
    const create = vi.spyOn(axios, 'create')
    const a = new HelpScoutAdapter(CFG)
    for (const call of [
      () => a.getMessage(CREDS, '1'),
      () => a.getTeam(CREDS, '1'),
      () => a.listMacros(CREDS, page(1, 10)),
      () => a.getMacro(CREDS, '1'),
    ]) {
      await expect(call()).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    }
    expect(create).not.toHaveBeenCalled()
  })
})

/**
 * Dex v1 reads: host, auth, paths, paging.
 *
 * https://getdex.com/docs/api-reference/authentication:
 *   "Base URL https://api.prod.getdex.com"
 *   "Required header Authorization: Bearer dex_your_api_key"
 *
 * Query parameters, per endpoint reference page:
 *   GET /v1/contacts/  (reference/v1/contacts/list-contacts):  take, skip, cursor, where, orderBy, include, select
 *   GET /v1/reminders/ (reference/v1/reminders/list-reminders): take, skip, cursor, where, orderBy, include, select
 *   GET /v1/timeline/  (reference/v1/timeline/list-notes):      orderBy, take, include, select, cursor, contactId
 * Responses: { error, data: { items, nextCursor, count } } (reminders: no count).
 *
 * End signal, from the x-mint note on GET /v1/contacts/ in
 * https://api.prod.getdex.com/docs/json:
 *   "Results are paginated. Use the `nextCursor` value from the response to
 *    fetch the next page. When `nextCursor` is null, you have reached the end
 *    of the list."
 *
 * Single reads: GET /v1/contacts/{contactId} → { error, data: <contact> },
 * GET /v1/reminders/{reminderId} → { error, data: <reminder> },
 * GET /v1/timeline/{noteId} → { error, data: { note: <note> } }.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import {
  _resetCursorPager,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { DexAdapter } from '../../../../../../src/verticals/crm/adapters/dex/index'

const CREDS = { accessToken: 'dex_test_key' }
const HOST = 'api.prod.getdex.com'

const DOCUMENTED: Record<string, Set<string>> = {
  '/v1/contacts/': new Set(['take', 'skip', 'cursor', 'where', 'orderBy', 'include', 'select']),
  '/v1/reminders/': new Set(['take', 'skip', 'cursor', 'where', 'orderBy', 'include', 'select']),
  '/v1/timeline/': new Set(['orderBy', 'take', 'include', 'select', 'cursor', 'contactId']),
}

const uuid = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`

function rowFor(path: string, i: number): Record<string, unknown> {
  const id = uuid(i)
  if (path === '/v1/contacts/') return { id, full_name: `Contact ${i}` }
  if (path === '/v1/reminders/') return { id, text: `Reminder ${i}`, is_complete: false }
  return { id, note: `Note ${i}`, channels: [], meeting_types: null }
}

/**
 * A fake Dex that honours ONLY the documented query parameters of each list,
 * refuses anything else, requires the Bearer header on the documented host,
 * and treats `cursor` as the id of the first row of the page it starts
 * (`nextCursor` = the next page's first id, null at the end). `skip` is
 * honoured only where it is documented.
 */
function fakeDex(total: number) {
  const sent: URL[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    sent.push(url)
    const headers = new Headers(init?.headers)
    if (url.host !== HOST) return new Response(`wrong host ${url.host}`, { status: 599 })
    if (headers.get('authorization') !== `Bearer ${CREDS.accessToken}`) {
      return Response.json({ error: { code: 'unauthenticated' } }, { status: 401 })
    }
    if ((init?.method ?? 'GET') !== 'GET') return new Response('method', { status: 405 })

    const single = /^\/v1\/(contacts|reminders|timeline)\/([0-9a-f-]{36})$/.exec(url.pathname)
    if (single) {
      const path = `/v1/${single[1]}/`
      const i = Array.from({ length: total }, (_, k) => k + 1).find((k) => uuid(k) === single[2])
      if (i === undefined) return Response.json({ error: { code: 'not_found' } }, { status: 404 })
      const row = rowFor(path, i)
      return Response.json({ error: false, data: single[1] === 'timeline' ? { note: row } : row })
    }

    const allowed = DOCUMENTED[url.pathname]
    if (!allowed) return new Response(`unexpected ${url.pathname}`, { status: 404 })
    for (const k of url.searchParams.keys()) {
      if (!allowed.has(k)) return new Response(`unknown param ${k}`, { status: 400 })
    }
    const rows = Array.from({ length: total }, (_, k) => rowFor(url.pathname, k + 1))
    const take = Number(url.searchParams.get('take') ?? '20')
    if (!Number.isInteger(take) || take < 1) return new Response('take', { status: 400 })
    let start = Number(url.searchParams.get('skip') ?? '0')
    const cursor = url.searchParams.get('cursor')
    if (cursor !== null) {
      const at = rows.findIndex((r) => r['id'] === cursor)
      if (at < 0) return new Response('cursor', { status: 400 })
      start += at
    }
    const items = rows.slice(start, start + take)
    const next = rows[start + take]
    const data: Record<string, unknown> = { items, nextCursor: next ? next['id'] : null }
    if (url.pathname !== '/v1/reminders/') data['count'] = total
    return Response.json({ error: false, data })
  })
  return sent
}

type ListMethod = 'listContacts' | 'listActivities' | 'listNotes'
const LISTS: { method: ListMethod; path: string }[] = [
  { method: 'listContacts', path: '/v1/contacts/' },
  { method: 'listActivities', path: '/v1/reminders/' },
  { method: 'listNotes', path: '/v1/timeline/' },
]

function params(page: number, limit: number): QueryParams {
  return withPageSink({ page, limit })
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe.each(LISTS)('dex $method', ({ method, path }) => {
  it('walks N = 2L+1 rows: every id once, hasMore exact, documented params only', async () => {
    const L = 4
    const N = 2 * L + 1
    const sent = fakeDex(N)
    const adapter = new DexAdapter()
    const seen: string[] = []
    const more: (boolean | undefined)[] = []
    for (let page = 1; page <= 3; page++) {
      const p = params(page, L)
      const rows = await adapter[method](CREDS, p)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(p)?.hasMore)
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => uuid(i + 1)))
    expect(more).toEqual([true, true, false])
    expect(sent.every((u) => u.host === HOST && u.pathname === path)).toBe(true)
    expect(sent.every((u) => u.searchParams.get('take') === String(L))).toBe(true)
  })

  it('sends the caller limit as take', async () => {
    const sent = fakeDex(3)
    await new DexAdapter()[method](CREDS, params(1, 7))
    expect(sent[0]!.searchParams.get('take')).toBe('7')
  })

  it('answers a page past the end with no rows and hasMore false', async () => {
    fakeDex(3)
    const adapter = new DexAdapter()
    const p1 = params(1, 3)
    expect(await adapter[method](CREDS, p1)).toHaveLength(3)
    expect(readUpstreamPage(p1)?.hasMore).toBe(false)
    const p2 = params(2, 3)
    expect(await adapter[method](CREDS, p2)).toEqual([])
    expect(readUpstreamPage(p2)?.hasMore ?? false).toBe(false)
  })
})

describe('dex offset lists (contacts, reminders)', () => {
  it.each(['listContacts', 'listActivities'] as const)(
    '%s reaches page N directly with skip = (page-1) × take',
    async (method) => {
      const sent = fakeDex(20)
      const rows = await new DexAdapter()[method](CREDS, params(3, 5))
      expect(sent).toHaveLength(1)
      expect(sent[0]!.searchParams.get('skip')).toBe('10')
      expect(rows.map((r) => r.id)).toEqual([11, 12, 13, 14, 15].map(uuid))
    },
  )
})

describe('dex listNotes (timeline, cursor only)', () => {
  it('never sends skip, and reaches page 3 cold by walking the cursor chain', async () => {
    const sent = fakeDex(12)
    const rows = await new DexAdapter().listNotes(CREDS, params(3, 4))
    expect(rows.map((r) => r.id)).toEqual([9, 10, 11, 12].map(uuid))
    expect(sent).toHaveLength(3)
    expect(sent.some((u) => u.searchParams.has('skip'))).toBe(false)
    expect(sent[0]!.searchParams.has('cursor')).toBe(false)
    expect(sent[2]!.searchParams.get('cursor')).toBe(uuid(9))
  })
})

describe('dex single reads', () => {
  it('getContact reads GET /v1/contacts/{id} → data', async () => {
    const sent = fakeDex(3)
    const c = await new DexAdapter().getContact(CREDS, uuid(2))
    expect(sent[0]!.pathname).toBe(`/v1/contacts/${uuid(2)}`)
    expect(c).toMatchObject({ id: uuid(2), name: 'Contact 2' })
  })

  it('getActivity reads GET /v1/reminders/{id} → data', async () => {
    const sent = fakeDex(3)
    const a = await new DexAdapter().getActivity(CREDS, uuid(3))
    expect(sent[0]!.pathname).toBe(`/v1/reminders/${uuid(3)}`)
    expect(a).toMatchObject({ id: uuid(3), subject: 'Reminder 3', done: false })
  })

  it('getNote reads GET /v1/timeline/{id} → data.note', async () => {
    const sent = fakeDex(3)
    const n = await new DexAdapter().getNote(CREDS, uuid(1))
    expect(sent[0]!.pathname).toBe(`/v1/timeline/${uuid(1)}`)
    expect(n).toMatchObject({ id: uuid(1), content: 'Note 1' })
  })

  // The spec marks GET /v1/contacts/{contactId} → data as "nullable": true.
  it('getContact answers a null data with a 404, not a TypeError', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ error: false, data: null }))
    await expect(new DexAdapter().getContact(CREDS, uuid(1))).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    })
  })

  it('surfaces a 404 with its status code', async () => {
    fakeDex(1)
    await expect(new DexAdapter().getContact(CREDS, uuid(9))).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

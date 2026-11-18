/**
 * Respond.io contacts: list and get.
 *
 * "List the contacts" is `POST https://api.respond.io/v2/contact/list`
 * (https://developers.respond.io/docs/api/0759d02787ab3-list-the-contacts,
 * served as Stoplight node JSON at
 * https://stoplight.io/api/v1/projects/cHJqOjIyMDQ1OA/nodes/0759d02787ab3-list-the-contacts).
 * Query: `cursorId` — "Pointer to the contact `id` from where the next batch
 * of records should start from." — and `limit` — "Number of contacts to
 * return i.e. page size." with `{minimum: 1, exclusiveMaximum: 100, default: 10}`.
 * Body: the "All Contact(s)" example `{"search":"","filter":{"$and":[]}, ...}`.
 * 200: `{items: [Contact], pagination: {next, previous}}`, `next` example
 * "https://api.respond.io/contact/list?limit=10&cursorId=-10".
 *
 * The adapter once sent `GET /v2/contact`, a route the docs do not have, read
 * `data.contacts`, which the docs never return, and never read `page`.
 *
 * The fake upstream honours ONLY the documented parameters: `limit` (default
 * 10, rejected at 100 or more) and `cursorId`, on `POST /v2/contact/list`.
 * Its `next` URL, like the docs example, drops the `/v2` prefix and carries
 * a negative cursorId, so the adapter must read the cursor out of the URL
 * rather than follow or rebuild it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _resetCursorPager,
  readUpstreamPage,
  withPageSink,
  type Credentials,
} from '@opensteward/shared'
import { RespondIoAdapter } from '../../../../../../src/verticals/crm/adapters/respond-io/index'
import { ContactSchema } from '../../../../../../src/verticals/crm/schema/contact'

const creds: Credentials = { accessToken: 'respond-token' } as Credentials

interface Seen {
  method: string
  path: string
  query: URLSearchParams
  body: unknown
  auth: string | null
}
let seen: Seen[] = []

function contactsUpstream(n: number) {
  const rows = Array.from({ length: n }, (_, i) => ({
    id: 1000 + i,
    firstName: `First${i}`,
    lastName: null,
    phone: null,
    email: `c${i}@example.test`,
    created_at: 1663274081,
  }))
  return (query: URLSearchParams) => {
    const raw = query.get('limit')
    const size = raw === null ? 10 : Number(raw)
    if (!Number.isInteger(size) || size < 1 || size >= 100) {
      return { status: 400, body: { code: 400, message: 'Validation error.' } }
    }
    const cursor = query.get('cursorId')
    let start = 0
    if (cursor !== null) {
      // Cursor = the negated offset, so the fake's cursors look like the docs' "-10".
      if (!/^-\d+$/.test(cursor)) throw new Error(`undocumented cursorId: ${cursor}`)
      start = -Number(cursor)
    }
    const items = rows.slice(start, start + size)
    const end = start + items.length
    const next =
      end < rows.length ? `https://api.respond.io/contact/list?limit=${size}&cursorId=-${end}` : ''
    const previous =
      start > 0
        ? `https://api.respond.io/contact/list?limit=${size}&cursorId=-${Math.max(0, start - size)}`
        : ''
    return { status: 200, body: { items, pagination: { next, previous } } }
  }
}

function install(
  route: (q: URLSearchParams) => { status: number; body: unknown },
): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input)
    const method = init?.method ?? 'GET'
    const headers = new Headers(init?.headers)
    seen.push({
      method,
      path: url.pathname,
      query: url.searchParams,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      auth: headers.get('authorization'),
    })
    if (url.host !== 'api.respond.io' || url.pathname !== '/v2/contact/list' || method !== 'POST') {
      return new Response(JSON.stringify({ code: 404, message: 'Not found' }), { status: 404 })
    }
    const { status, body } = route(url.searchParams)
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

beforeEach(() => {
  seen = []
  _resetCursorPager()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const ids = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => String(1000 + from + i))

describe('respond-io listContacts pages POST /contact/list by cursorId', () => {
  const L = 3
  const N = 2 * L + 1

  it('serves every row once, in order, with exact hasMore', async () => {
    install(contactsUpstream(N))
    const adapter = new RespondIoAdapter()
    const got: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listContacts(creds, params)
      for (const r of rows) ContactSchema.parse(r)
      got.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.pageSize).toBeUndefined()
    }
    expect(got).toEqual(ids(0, N))
    expect(new Set(got).size).toBe(N)
    expect(more).toEqual([true, true, false])
  })

  it('sends the documented request: POST, Bearer, limit, no cursor on page 1, the next cursorId on page 2', async () => {
    install(contactsUpstream(N))
    const adapter = new RespondIoAdapter()
    await adapter.listContacts(creds, withPageSink({ page: 1, limit: L }))
    await adapter.listContacts(creds, withPageSink({ page: 2, limit: L }))
    expect(seen).toHaveLength(2)
    expect(seen[0]!.method).toBe('POST')
    expect(seen[0]!.path).toBe('/v2/contact/list')
    expect(seen[0]!.auth).toBe('Bearer respond-token')
    expect(seen[0]!.body).toEqual({ search: '', filter: { $and: [] } })
    expect([...seen[0]!.query.keys()]).toEqual(['limit'])
    expect(seen[0]!.query.get('limit')).toBe(String(L))
    // The cursor is read out of pagination.next, not the next URL followed.
    expect(seen[1]!.path).toBe('/v2/contact/list')
    expect(seen[1]!.query.get('cursorId')).toBe(`-${L}`)
    expect(seen[1]!.query.get('limit')).toBe(String(L))
  })

  it('reaches page 3 cold by walking the cursor chain', async () => {
    install(contactsUpstream(N))
    const params = withPageSink({ page: 3, limit: L })
    const rows = await new RespondIoAdapter().listContacts(creds, params)
    expect(rows.map((r) => r.id)).toEqual(ids(2 * L, 1))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(seen).toHaveLength(3)
  })

  it('a page past the end is empty with hasMore false', async () => {
    install(contactsUpstream(L))
    const adapter = new RespondIoAdapter()
    const p1 = withPageSink({ page: 1, limit: L })
    expect((await adapter.listContacts(creds, p1)).map((r) => r.id)).toEqual(ids(0, L))
    expect(readUpstreamPage(p1)?.hasMore).toBe(false)
    const p2 = withPageSink({ page: 2, limit: L })
    expect(await adapter.listContacts(creds, p2)).toEqual([])
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
  })

  it('clamps limit below the documented exclusive maximum of 100 and reports the size sent', async () => {
    install(contactsUpstream(150))
    const adapter = new RespondIoAdapter()
    expect(adapter.capabilities.maxPageSize).toBe(99)
    const params = withPageSink({ page: 1, limit: 250 })
    const rows = await adapter.listContacts(creds, params)
    expect(seen[0]!.query.get('limit')).toBe('99')
    expect(rows).toHaveLength(99)
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: true, pageSize: 99 })
  })

  it('never reuses a cursor cached for a different page size', async () => {
    install(contactsUpstream(N))
    const adapter = new RespondIoAdapter()
    // Walk pages 1 and 2 at limit 2, which caches the cursors of a size-2 chain.
    await adapter.listContacts(creds, withPageSink({ page: 1, limit: 2 }))
    await adapter.listContacts(creds, withPageSink({ page: 2, limit: 2 }))
    seen = []
    // Page 2 at limit 3 starts at row 3, so its cursor must come from a size-3 chain.
    const rows = await adapter.listContacts(creds, withPageSink({ page: 2, limit: 3 }))
    expect(rows.map((r) => r.id)).toEqual(ids(3, 3))
    expect(seen.map((s) => s.query.get('cursorId'))).toEqual([null, '-3'])
  })

  it('never reuses a cursor cached for another connection', async () => {
    install(contactsUpstream(N))
    const adapter = new RespondIoAdapter()
    await adapter.listContacts(creds, withPageSink({ page: 1, limit: L }))
    await adapter.listContacts(creds, withPageSink({ page: 2, limit: L }))
    seen = []
    const other: Credentials = { accessToken: 'other-tenant-token' } as Credentials
    await adapter.listContacts(other, withPageSink({ page: 2, limit: L }))
    // The other connection walks its own chain from page 1, with its own token.
    expect(seen.map((s) => s.query.get('cursorId'))).toEqual([null, `-${L}`])
    expect(seen.every((s) => s.auth === 'Bearer other-tenant-token')).toBe(true)
  })

  it('fails loudly when pagination.next carries no cursorId instead of ending the collection', async () => {
    install(() => ({
      status: 200,
      body: {
        items: [{ id: 1, firstName: 'A' }],
        pagination: { next: 'https://api.respond.io/contact/list?limit=1', previous: '' },
      },
    }))
    await expect(
      new RespondIoAdapter().listContacts(creds, withPageSink({ page: 1, limit: 1 })),
    ).rejects.toThrow(/cursorId/)
  })
})

describe('respond-io getContact', () => {
  it('reads GET /contact/{identifier} with the documented id: prefix and the bare Contact body', async () => {
    const fn = vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input)
      seen.push({
        method: init?.method ?? 'GET',
        path: url.pathname,
        query: url.searchParams,
        body: undefined,
        auth: null,
      })
      if (url.pathname !== '/v2/contact/id:12345') {
        return new Response(JSON.stringify({ code: 404, message: 'Not found' }), { status: 404 })
      }
      return new Response(
        JSON.stringify({
          id: 12345,
          firstName: 'Muhammad',
          lastName: 'Mahin',
          email: 'test@example.com',
          created_at: 1663274081,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    })
    vi.stubGlobal('fetch', fn)
    const contact = await new RespondIoAdapter().getContact(creds, '12345')
    expect(seen[0]!.method).toBe('GET')
    expect(seen[0]!.path).toBe('/v2/contact/id:12345')
    expect(ContactSchema.parse(contact).id).toBe('12345')
    expect(contact.name).toBe('Muhammad Mahin')
  })
})

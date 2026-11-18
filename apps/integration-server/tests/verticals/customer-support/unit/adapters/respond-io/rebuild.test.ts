/**
 * respond-io — rebuilt against the v2 API docs (Stoplight project
 * cHJqOjIyMDQ1OA, https://developers.respond.io/docs/api/).
 *
 * listContacts: POST /contact/list
 * (https://developers.respond.io/docs/api/0759d02787ab3-list-the-contacts).
 * `limit` ("Number of contacts to return i.e. page size.", minimum 1,
 * exclusiveMaximum 100, default 10) and `cursorId` ("Pointer to the contact
 * `id` from where the next batch of records should start from.") are QUERY
 * parameters; the body is the filter. The 200 body is `{ items, pagination:
 * { next, previous } }`, `next` being a URL such as
 * 'https://api.respond.io/contact/list?limit=10&cursorId=-10'.
 *
 * The adapter used to send limit/cursorId in the body and read `data`, so it
 * returned [] on every page. The fake below honours ONLY the documented
 * parameters.
 *
 * listTickets / getTicket / listTags have no documented endpoint and refuse
 * with 501 before any request.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { withPageSink, readUpstreamPage, _resetCursorPager } from '@opensteward/shared'
import { RespondIoAdapter } from '../../../../../../src/verticals/customer-support/adapters/respond-io/index'
import { RespondIoClient } from '../../../../../../src/verticals/customer-support/adapters/respond-io/client'
import { ContactSchema } from '../../../../../../src/verticals/customer-support/schema/contact'
import type { Credentials } from '../../../../../../src/verticals/customer-support/adapter/interface'
import { DOC_CONTACT } from './fixtures'

const creds = { accessToken: 'api-key', extra: {} } as Credentials
const adapter = new RespondIoAdapter()

interface Call {
  method: 'get' | 'post'
  path: string
  body?: unknown
  params?: Record<string, unknown>
}

/**
 * Fake /contact/list over `total` contacts with descending ids (the doc's
 * example cursor is negative, so the fake's cursorId is an opaque position,
 * not an offset the adapter could compute). Reads only query `limit` and
 * `cursorId`; a limit outside 1..99 is a 400 "Validation error.".
 */
function fakeRespondIo(total: number, opts: { ragged?: boolean } = {}) {
  const calls: Call[] = []
  const contacts = Array.from({ length: total }, (_, i) => ({
    ...DOC_CONTACT,
    id: 100_000 - i,
    firstName: `C${i}`,
  }))
  vi.spyOn(RespondIoClient.prototype, 'post').mockImplementation((async (
    path: string,
    body?: Record<string, unknown>,
    params?: Record<string, unknown>,
  ) => {
    calls.push({ method: 'post', path, body, params })
    if (path !== '/contact/list') throw new Error(`unexpected path in test: ${path}`)
    const q = params ?? {}
    const limit = q['limit'] === undefined ? 10 : Number(q['limit'])
    if (!(Number.isInteger(limit) && limit >= 1 && limit < 100)) {
      throw Object.assign(new Error('Validation error.'), { response: { status: 400 } })
    }
    const start =
      q['cursorId'] === undefined
        ? 0
        : contacts.findIndex((c) => String(c.id) === String(q['cursorId']))
    if (start < 0) throw new Error(`unknown cursorId ${String(q['cursorId'])}`)
    // A ragged upstream serves one row fewer than asked on its first page.
    const size = opts.ragged && q['cursorId'] === undefined ? Math.max(1, limit - 1) : limit
    const items = contacts.slice(start, start + size)
    const after = contacts[start + size]
    return {
      items,
      pagination: {
        next: after
          ? `https://api.respond.io/contact/list?limit=${limit}&cursorId=${after.id}`
          : '',
        previous: '',
      },
    }
  }) as typeof RespondIoClient.prototype.post)
  vi.spyOn(RespondIoClient.prototype, 'get').mockImplementation((async (path: string) => {
    calls.push({ method: 'get', path })
    if (path === '/contact/id:12345') return DOC_CONTACT
    throw new Error(`unexpected path in test: ${path}`)
  }) as typeof RespondIoClient.prototype.get)
  return calls
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe('respond-io listContacts request shape', () => {
  it('sends limit as a query parameter, the filter as the body, and reads items', async () => {
    const calls = fakeRespondIo(3)
    const rows = await adapter.listContacts(creds, withPageSink({ page: 1, limit: 5 }))
    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({
      method: 'post',
      path: '/contact/list',
      body: { search: '', filter: { $and: [] } },
      params: { limit: 5 },
    })
    expect(rows.map((r) => r.id)).toEqual(['100000', '99999', '99998'])
    for (const r of rows) ContactSchema.parse(r)
  })

  it('clamps the limit to the documented maximum (exclusiveMaximum 100) and reports it', async () => {
    const calls = fakeRespondIo(250)
    const params = withPageSink({ page: 1, limit: 500 })
    const rows = await adapter.listContacts(creds, params)
    expect(calls[0]!.params).toEqual({ limit: 99 })
    expect(rows).toHaveLength(99)
    expect(readUpstreamPage(params)).toEqual({ hasMore: true, pageSize: 99 })
    expect(adapter.capabilities.maxPageSize).toBe(99)
  })

  it('follows the cursorId from pagination.next into the next request', async () => {
    const calls = fakeRespondIo(5)
    await adapter.listContacts(creds, withPageSink({ page: 2, limit: 2 }))
    expect(calls.map((c) => c.params)).toEqual([{ limit: 2 }, { limit: 2, cursorId: '99998' }])
  })

  it('an explicit cursor is one request at that position', async () => {
    const calls = fakeRespondIo(5)
    const params = withPageSink({ limit: 2, cursor: '99997' })
    const rows = await adapter.listContacts(creds, params)
    expect(calls.map((c) => c.params)).toEqual([{ limit: 2, cursorId: '99997' }])
    expect(rows.map((r) => r.id)).toEqual(['99997', '99996'])
    expect(readUpstreamPage(params)).toEqual({ hasMore: false })
  })

  it('an explicit cursor with a pagination.next reports hasMore true', async () => {
    const calls = fakeRespondIo(5)
    const params = withPageSink({ limit: 2, cursor: '99999' })
    const rows = await adapter.listContacts(creds, params)
    expect(calls.map((c) => c.params)).toEqual([{ limit: 2, cursorId: '99999' }])
    expect(rows.map((r) => r.id)).toEqual(['99999', '99998'])
    expect(readUpstreamPage(params)).toEqual({ hasMore: true })
  })

  it('sends the documented default limit (10) when the caller gives none', async () => {
    const calls = fakeRespondIo(3)
    await adapter.listContacts(creds, withPageSink({ page: 1 }))
    expect(calls.map((c) => c.params)).toEqual([{ limit: 10 }])
  })

  it('clamps a limit below the documented minimum (1) up to 1', async () => {
    const calls = fakeRespondIo(3)
    const rows = await adapter.listContacts(creds, withPageSink({ page: 1, limit: 0 }))
    expect(calls.map((c) => c.params)).toEqual([{ limit: 1 }])
    expect(rows.map((r) => r.id)).toEqual(['100000'])
  })
})

describe('respond-io listContacts cursor-chain isolation', () => {
  it("a second connection's page 2 does not reuse the first connection's cursor", async () => {
    const calls = fakeRespondIo(5)
    const other = { accessToken: 'another-api-key', extra: {} } as Credentials
    await adapter.listContacts(creds, withPageSink({ page: 1, limit: 2 }))
    const before = calls.length
    await adapter.listContacts(other, withPageSink({ page: 2, limit: 2 }))
    expect(calls.slice(before).map((c) => c.params)).toEqual([
      { limit: 2 },
      { limit: 2, cursorId: '99998' },
    ])
  })

  it('a different page size does not reuse the cursor chain of another size', async () => {
    const calls = fakeRespondIo(9)
    await adapter.listContacts(creds, withPageSink({ page: 1, limit: 2 }))
    const before = calls.length
    const rows = await adapter.listContacts(creds, withPageSink({ page: 2, limit: 3 }))
    expect(calls.slice(before).map((c) => c.params)).toEqual([
      { limit: 3 },
      { limit: 3, cursorId: '99997' },
    ])
    expect(rows.map((r) => r.id)).toEqual(['99997', '99996', '99995'])
  })
})

describe('respond-io listContacts paging walk', () => {
  for (const ragged of [false, true]) {
    it(`serves every contact once over N = 2L+1${ragged ? ' (ragged upstream page)' : ''}`, async () => {
      const L = 4
      const total = 2 * L + 1
      fakeRespondIo(total, { ragged })
      const seen: string[] = []
      const more: boolean[] = []
      for (let page = 1; page <= 10; page++) {
        const params = withPageSink({ page, limit: L })
        const rows = await adapter.listContacts(creds, params)
        seen.push(...rows.map((r) => r.id))
        const hasMore = readUpstreamPage(params)?.hasMore
        more.push(hasMore === true)
        if (!hasMore) break
      }
      expect(seen).toEqual(Array.from({ length: total }, (_, i) => String(100_000 - i)))
      expect(new Set(seen).size).toBe(total)
      expect(more.at(-1)).toBe(false)
      expect(more.slice(0, -1).every(Boolean)).toBe(true)
    })
  }

  it('a page past the end is empty with hasMore false', async () => {
    fakeRespondIo(3)
    const params = withPageSink({ page: 3, limit: 2 })
    expect(await adapter.listContacts(creds, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('an empty page ends the walk even if pagination.next is present', async () => {
    vi.spyOn(RespondIoClient.prototype, 'post').mockResolvedValue({
      items: [],
      pagination: {
        next: 'https://api.respond.io/contact/list?limit=10&cursorId=-10',
        previous: '',
      },
    })
    const params = withPageSink({ page: 1, limit: 10 })
    expect(await adapter.listContacts(creds, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })
})

describe('respond-io getContact', () => {
  it('reads GET /contact/id:{id}, whose 200 body is the Contact itself', async () => {
    const calls = fakeRespondIo(0)
    const out = ContactSchema.parse(await adapter.getContact(creds, '12345'))
    expect(calls).toEqual([{ method: 'get', path: '/contact/id:12345' }])
    expect(out.id).toBe('12345')
    expect(out.name).toBe('Muhammad Mahin')
  })
})

describe('respond-io refusals (no documented endpoint)', () => {
  const refused: Array<[string, () => Promise<unknown>]> = [
    ['listTickets', () => adapter.listTickets(creds, withPageSink({ page: 1, limit: 10 }))],
    ['getTicket', () => adapter.getTicket(creds, '1')],
    ['listTags', () => adapter.listTags(creds, withPageSink({ page: 1, limit: 10 }))],
  ]
  for (const [name, call] of refused) {
    it(`${name} throws 501 NOT_SUPPORTED and sends no request`, async () => {
      const calls = fakeRespondIo(3)
      await expect(call()).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
      expect(calls).toEqual([])
    })
  }
})

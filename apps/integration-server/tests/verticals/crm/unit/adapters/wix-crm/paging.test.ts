import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PAGE_LIMIT, readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { QueryParams } from '../../../../../../src/verticals/crm/adapter/interface'
import { WixCrmAdapter } from '../../../../../../src/verticals/crm/adapters/wix-crm/index'
import { ContactSchema } from '../../../../../../src/verticals/crm/schema/contact'

/**
 * Wix Contacts v4 Query Contacts
 * (https://dev.wix.com/docs/api-reference/crm/members-contacts/contacts/contacts/contact-v4/query-contacts.md):
 *
 *   "URL: https://www.wixapis.com/contacts/v4/contacts/query" / "Method: POST"
 *   paging.limit: "Default: `50`. <br> Maximum: `1000`."
 *   paging.offset: "Number of items to skip in the current sort order."
 *   pagingMetadata.total: "The total number of items that match the query."
 *   pagingMetadata.tooManyToCount: "A flag that indicates the server failed
 *   to calculate 'total' field."
 *
 * The adapter used to POST to /crm/v3/contacts/query, which Wix does not
 * document, and sent offset 0 for every page.
 */

const creds = { accessToken: 'tok' }
const QUERY = 'https://www.wixapis.com/contacts/v4/contacts/query'
const UPSTREAM_DEFAULT = 50
const UPSTREAM_MAX = 1000

interface Sent {
  url: string
  method: string
  body: unknown
  auth: string | null
}
let sent: Sent[] = []

function contact(i: number) {
  return {
    id: `c${i + 1}`,
    revision: 1,
    createdDate: '2026-01-01T00:00:00.000Z',
    updatedDate: '2026-01-02T00:00:00.000Z',
    primaryInfo: { email: `c${i + 1}@example.com` },
    info: { name: { first: `First${i + 1}`, last: 'Last' } },
  }
}

/**
 * Honours only the documented query body: `query.paging.limit` (default 50,
 * rejected above 1000 with the documented 400) and `query.paging.offset`.
 */
function serve(n: number, opts: { tooManyToCount?: boolean } = {}) {
  const rows = Array.from({ length: n }, (_, i) => contact(i))
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const body = init.body ? JSON.parse(String(init.body)) : undefined
      const headers = new Headers(init.headers)
      sent.push({
        url: input,
        method: init.method ?? 'GET',
        body,
        auth: headers.get('authorization'),
      })
      if (
        input.startsWith('https://www.wixapis.com/contacts/v4/contacts/') &&
        init.method === 'GET'
      ) {
        const id = decodeURIComponent(
          input.slice('https://www.wixapis.com/contacts/v4/contacts/'.length),
        )
        const row = rows.find((r) => r.id === id)
        if (!row) return new Response('{"message":"Contact not found."}', { status: 404 })
        return Response.json({ contact: row })
      }
      if (input !== QUERY || init.method !== 'POST')
        return new Response('not found', { status: 404 })
      const paging = (body?.query?.paging ?? {}) as { limit?: number; offset?: number }
      const limit = paging.limit ?? UPSTREAM_DEFAULT
      if (limit > UPSTREAM_MAX) {
        return new Response('Illegal paging limit. The limit must be between 1 and 1,000.', {
          status: 400,
        })
      }
      const offset = paging.offset ?? 0
      const page = rows.slice(offset, offset + limit)
      return Response.json({
        contacts: page,
        pagingMetadata: opts.tooManyToCount
          ? { count: page.length, offset, total: page.length, tooManyToCount: true }
          : { count: page.length, offset, total: rows.length },
      })
    }),
  )
}

function list(params: QueryParams) {
  return new WixCrmAdapter().listContacts(creds, params)
}

beforeEach(() => {
  sent = []
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('wix-crm listContacts', () => {
  it('declares the documented page maximum', () => {
    expect(new WixCrmAdapter().capabilities.maxPageSize).toBe(1000)
  })

  it('POSTs the caller page as limit/offset to the v4 query endpoint', async () => {
    serve(20)
    await list({ page: 3, limit: 4 })
    expect(sent).toHaveLength(1)
    expect(sent[0]).toEqual({
      url: QUERY,
      method: 'POST',
      body: { query: { paging: { limit: 4, offset: 8 } } },
      auth: 'Bearer tok',
    })
  })

  it('walks 2L+1 contacts in three pages, each id once, hasMore exact', async () => {
    const L = 3
    serve(2 * L + 1)
    const seen: string[] = []
    const hasMore: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await list(params)
      rows.forEach((r) => ContactSchema.parse(r))
      seen.push(...rows.map((r) => r.id))
      const meta = readUpstreamPage(params)
      expect(meta?.totalCount).toBe(2 * L + 1)
      hasMore.push(meta?.hasMore)
    }
    expect(seen).toEqual(['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'])
    expect(hasMore).toEqual([true, true, false])
  })

  it('reports hasMore false when the total is an exact multiple of the page', async () => {
    serve(4)
    const params = withPageSink({ page: 2, limit: 2 })
    expect((await list(params)).map((r) => r.id)).toEqual(['c3', 'c4'])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('clamps to 1000, strides by the clamped size and reports it', async () => {
    serve(2500)
    const params = withPageSink({ page: 2, limit: 1500 })
    const rows = await list(params)
    expect(sent[0]!.body).toEqual({ query: { paging: { limit: 1000, offset: 1000 } } })
    expect(rows[0]!.id).toBe('c1001')
    expect(readUpstreamPage(params)).toMatchObject({
      pageSize: 1000,
      totalCount: 2500,
      hasMore: true,
    })
  })

  it('sends the shared default page size when the caller gives no limit', async () => {
    serve(3)
    await list({ page: 2 })
    expect(DEFAULT_PAGE_LIMIT).not.toBe(UPSTREAM_DEFAULT)
    expect(sent[0]!.body).toEqual({
      query: { paging: { limit: DEFAULT_PAGE_LIMIT, offset: DEFAULT_PAGE_LIMIT } },
    })
  })

  // The fake also sends a `total` that equals this page, which is not a real count.
  it('reports no total when Wix could not count (tooManyToCount)', async () => {
    serve(5, { tooManyToCount: true })
    const params = withPageSink({ page: 1, limit: 2 })
    await list(params)
    expect(readUpstreamPage(params)).toBeUndefined()
  })
})

describe('wix-crm getContact', () => {
  it('percent-encodes the id into a single path segment', async () => {
    serve(0)
    await expect(new WixCrmAdapter().getContact(creds, 'a/b?c')).rejects.toThrow()
    expect(sent[0]!.url).toBe('https://www.wixapis.com/contacts/v4/contacts/a%2Fb%3Fc')
  })

  it('GETs the v4 contact by id and unwraps `contact`', async () => {
    serve(3)
    const c = await new WixCrmAdapter().getContact(creds, 'c2')
    expect(sent[0]).toMatchObject({
      url: 'https://www.wixapis.com/contacts/v4/contacts/c2',
      method: 'GET',
    })
    expect(ContactSchema.parse(c)).toMatchObject({
      id: 'c2',
      first_name: 'First2',
      email: 'c2@example.com',
    })
  })
})

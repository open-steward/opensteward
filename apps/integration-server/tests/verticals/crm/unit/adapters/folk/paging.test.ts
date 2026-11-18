/**
 * Folk list paging and request shape, from the first-party docs (2026-09-25):
 *
 *   api-reference/overview.md: "The base URL for the API is https://api.folk.app"
 *   api-reference/authentication.md: "include the API key in the `Authorization`
 *     header using the bearer token scheme"
 *   api-reference/versioning.md: "You can specify the API version you want to
 *     use through the `X-API-Version` header."
 *   api-reference/pagination.md: "opaque cursor-based pagination through the
 *     `cursor` parameter ... you can receive a `pagination.nextLink` value ...
 *     pick the `cursor` parameter from the URL and use it in the next request
 *     ... If there are no more pages of results, the `pagination.nextLink`
 *     will be omitted from the response."
 *   schemas/2025-06-09.json, GET /v1/people, /v1/companies, /v1/notes: limit
 *     "minimum": 1, "maximum": 100, "default": 20; cursor "maxLength": 512.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import {
  _resetCursorPager,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { FolkAdapter } from '../../../../../../src/verticals/crm/adapters/folk/index'
import { documentedCompany, documentedNote, documentedPerson } from './fixtures/documented'

const CREDS = { accessToken: 'FOLK_test_key_0123456789abcdefgh' }
const OTHER_CREDS = { accessToken: 'FOLK_other_key_9876543210zyxwvut' }
const TOKENS = new Set([CREDS.accessToken, OTHER_CREDS.accessToken])
const MAX = 100

type ListMethod = 'listContacts' | 'listCompanies' | 'listNotes'
type GetMethod = 'getContact' | 'getCompany' | 'getNote'

const CASES: {
  list: ListMethod
  get: GetMethod
  path: string
  row: (i: number) => Record<string, unknown>
}[] = [
  {
    list: 'listContacts',
    get: 'getContact',
    path: '/v1/people',
    row: (i) => ({ ...documentedPerson(), id: `per_${i}` }),
  },
  {
    list: 'listCompanies',
    get: 'getCompany',
    path: '/v1/companies',
    row: (i) => ({ ...documentedCompany(), id: `com_${i}` }),
  },
  {
    list: 'listNotes',
    get: 'getNote',
    path: '/v1/notes',
    row: (i) => ({ ...documentedNote(), id: `nte_${i}` }),
  },
]

const DOCUMENTED = new Set(['cursor', 'limit'])

interface Sent {
  url: URL
  headers: Headers
}

/**
 * A fake Folk that honours ONLY `limit` (1..100, default 20) and `cursor`
 * (opaque, taken from a previous `pagination.nextLink`), requires Bearer auth,
 * and answers with the documented `{ data: { items, pagination } }` envelope.
 */
function fakeFolk(path: string, total: number, row: (i: number) => Record<string, unknown>) {
  const rows = Array.from({ length: total }, (_, i) => row(i + 1))
  const sent: Sent[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    const headers = new Headers(init?.headers)
    sent.push({ url, headers })
    if (url.origin !== 'https://api.folk.app') return new Response('bad host', { status: 404 })
    const auth = headers.get('authorization') ?? ''
    if (!auth.startsWith('Bearer ') || !TOKENS.has(auth.slice('Bearer '.length))) {
      return new Response('No authorization header found.', { status: 401 })
    }
    if ((init?.method ?? 'GET') !== 'GET') return new Response('method', { status: 405 })
    const single = url.pathname.startsWith(`${path}/`) ? url.pathname.slice(path.length + 1) : null
    if (single !== null) {
      const hit = rows.find((r) => r.id === decodeURIComponent(single))
      return hit
        ? Response.json({ data: hit })
        : Response.json({ error: { message: 'not found' } }, { status: 404 })
    }
    if (url.pathname !== path) return new Response(`unexpected ${url.pathname}`, { status: 404 })
    for (const k of url.searchParams.keys()) {
      if (!DOCUMENTED.has(k)) return new Response(`unknown param ${k}`, { status: 400 })
    }
    const rawLimit = url.searchParams.get('limit')
    const limit = rawLimit === null ? 20 : Number(rawLimit)
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX) {
      return new Response(`limit must be 1..${MAX}`, { status: 400 })
    }
    const cursor = url.searchParams.get('cursor')
    const offset = cursor === null ? 0 : Number(Buffer.from(cursor, 'base64').toString())
    const end = offset + limit
    const pagination =
      end < total
        ? {
            nextLink: `https://api.folk.app${path}?limit=${limit}&cursor=${encodeURIComponent(
              Buffer.from(JSON.stringify(end)).toString('base64'),
            )}`,
          }
        : {}
    return Response.json({ data: { items: rows.slice(offset, end), pagination } })
  })
  return { sent }
}

const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}_${i + 1}`)

async function list(
  method: ListMethod,
  params: QueryParams,
  creds: { accessToken: string } = CREDS,
): Promise<{ id: string }[]> {
  return (await new FolkAdapter()[method](creds, params)) as { id: string }[]
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe.each(CASES)('folk $list', ({ list: method, get, path, row }) => {
  const prefix = String(row(0).id).split('_')[0]!

  it('pages 1..3 of 2L+1 rows return every id once, in order, with exact hasMore', async () => {
    const L = 5
    const { sent } = fakeFolk(path, 2 * L + 1, row)
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      seen.push(...(await list(method, params)).map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids(prefix, 2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
    expect(sent).toHaveLength(3)
    expect(sent.every((s) => s.url.searchParams.get('limit') === String(L))).toBe(true)
  })

  it('sends the documented host, Bearer auth and version header, and no cursor on page 1', async () => {
    const { sent } = fakeFolk(path, 3, row)
    await list(method, withPageSink({ page: 1, limit: 2 }))
    expect(sent).toHaveLength(1)
    expect(sent[0]!.url.origin + sent[0]!.url.pathname).toBe(`https://api.folk.app${path}`)
    expect(sent[0]!.headers.get('authorization')).toBe(`Bearer ${CREDS.accessToken}`)
    expect(sent[0]!.headers.get('x-api-version')).toBe('2025-06-09')
    expect(sent[0]!.headers.has('x-folk-api-key')).toBe(false)
    expect(sent[0]!.url.searchParams.get('cursor')).toBeNull()
  })

  it('page 2 carries the cursor picked from pagination.nextLink', async () => {
    const { sent } = fakeFolk(path, 5, row)
    await list(method, withPageSink({ page: 1, limit: 2 }))
    await list(method, withPageSink({ page: 2, limit: 2 }))
    expect(sent).toHaveLength(2)
    expect(sent[1]!.url.searchParams.get('cursor')).toBe(
      Buffer.from(JSON.stringify(2)).toString('base64'),
    )
  })

  it('a cold page 3 walks the cursor chain and returns that page', async () => {
    const { sent } = fakeFolk(path, 7, row)
    const got = await list(method, withPageSink({ page: 3, limit: 3 }))
    expect(got.map((r) => r.id)).toEqual([`${prefix}_7`])
    expect(sent).toHaveLength(3)
  })

  it('clamps a limit above the documented maximum of 100 and reports the size sent', async () => {
    const { sent } = fakeFolk(path, 150, row)
    const params = withPageSink({ page: 1, limit: 500 })
    const got = await list(method, params)
    expect(got).toHaveLength(MAX)
    expect(sent[0]!.url.searchParams.get('limit')).toBe(String(MAX))
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: true, pageSize: MAX })
  })

  it('a page past the end is empty with hasMore false', async () => {
    fakeFolk(path, 3, row)
    await list(method, withPageSink({ page: 1, limit: 5 }))
    const params = withPageSink({ page: 2, limit: 5 })
    expect(await list(method, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('a cursor cached at one limit is not reused at another limit', async () => {
    const { sent } = fakeFolk(path, 9, row)
    await list(method, withPageSink({ page: 1, limit: 2 }))
    await list(method, withPageSink({ page: 2, limit: 2 }))
    const got = await list(method, withPageSink({ page: 2, limit: 3 }))
    expect(got.map((r) => r.id)).toEqual([`${prefix}_4`, `${prefix}_5`, `${prefix}_6`])
    expect(sent.slice(2).map((s) => s.url.searchParams.get('limit'))).toEqual(['3', '3'])
  })

  it('a cursor cached for one connection is not reused by another', async () => {
    const { sent } = fakeFolk(path, 5, row)
    await list(method, withPageSink({ page: 1, limit: 2 }), CREDS)
    const before = sent.length
    const got = await list(method, withPageSink({ page: 2, limit: 2 }), OTHER_CREDS)
    expect(got.map((r) => r.id)).toEqual([`${prefix}_3`, `${prefix}_4`])
    const other = sent.slice(before)
    expect(other).toHaveLength(2)
    expect(other[0]!.url.searchParams.get('cursor')).toBeNull()
    expect(
      other.every((s) => s.headers.get('authorization') === `Bearer ${OTHER_CREDS.accessToken}`),
    ).toBe(true)
  })

  it('sends a fractional limit as the integer below it', async () => {
    const { sent } = fakeFolk(path, 5, row)
    const params = withPageSink({ page: 1, limit: 2.7 })
    expect(await list(method, params)).toHaveLength(2)
    expect(sent[0]!.url.searchParams.get('limit')).toBe('2')
    expect(readUpstreamPage(params)?.pageSize).toBe(2)
  })

  it('with no limit asks for the documented maximum of 100', async () => {
    const { sent } = fakeFolk(path, 3, row)
    await list(method, withPageSink({ page: 1 }))
    expect(sent[0]!.url.searchParams.get('limit')).toBe(String(MAX))
  })

  it(`${get} URI-encodes the id into the path`, async () => {
    const { sent } = fakeFolk(path, 1, row)
    await expect(new FolkAdapter()[get](CREDS, `${prefix}_a/b`)).rejects.toBeDefined()
    expect(sent[0]!.url.pathname).toBe(`${path}/${prefix}_a%2Fb`)
  })

  it(`${get} reads the documented single-record path and unwraps data`, async () => {
    const { sent } = fakeFolk(path, 3, row)
    const got = (await new FolkAdapter()[get](CREDS, `${prefix}_2`)) as { id: string }
    expect(got.id).toBe(`${prefix}_2`)
    expect(sent[0]!.url.pathname).toBe(`${path}/${prefix}_2`)
  })
})

describe('folk refusals send no request', () => {
  const refusals: [string, () => Promise<unknown>][] = [
    ['listDeals', () => new FolkAdapter().listDeals(CREDS, { page: 1, limit: 10 })],
    ['getDeal', () => new FolkAdapter().getDeal(CREDS, 'obj_1')],
    ['listPipelines', () => new FolkAdapter().listPipelines(CREDS, { page: 1, limit: 10 })],
    ['getPipeline', () => new FolkAdapter().getPipeline(CREDS, 'p1')],
  ]
  it.each(refusals)('%s throws 501 NOT_SUPPORTED', async (_name, run) => {
    const spy = vi.spyOn(globalThis, 'fetch')
    await expect(run()).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(spy).not.toHaveBeenCalled()
  })

  it('listDeals names the group and deal object it would need', async () => {
    await expect(new FolkAdapter().listDeals(CREDS, {})).rejects.toThrow(/groupId/)
  })
})

describe('folk capabilities', () => {
  it('declares the documented page maximum', () => {
    expect(new FolkAdapter().capabilities.maxPageSize).toBe(MAX)
  })
})

/**
 * Twenty Core REST reads: `GET /rest/<namePlural>` paged by cursor, and
 * `GET /rest/<namePlural>/<id>` for one record.
 *
 * https://api.twenty.com/open-api/core (fetched 2026-09-25):
 *   servers: [{ url: "https://api.twenty.com/rest/" }]
 *   "All list endpoints use cursor-based pagination.
 *    - Use **limit** to cap page size (default: 60, max: 200).
 *    - Use **starting_after** to fetch the next page (forward).
 *    ...
 *    - Responses include **pageInfo** with `hasNextPage`, `hasPreviousPage`,
 *      `startCursor`, and `endCursor`."
 *   "Send a Bearer token with each request: Authorization: Bearer <token>"
 *
 * https://docs.twenty.com/developers/extend/api.md:
 *   "**Core API** — `/rest/` and `/graphql/`"
 *   "| Self-Hosted | `https://{your-domain}/`  |"
 *
 * Envelopes from Twenty's source (rest-api-find-many.handler.ts,
 * rest-api-find-one.handler.ts): `{ data: { [namePlural]: records }, totalCount,
 * pageInfo }` and `{ data: { [nameSingular]: record } }`.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import {
  _resetCursorPager,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { TwentyAdapter } from '../../../../../../src/verticals/crm/adapters/twenty/index'
import { COMPANY, NOTE, OPPORTUNITY, PERSON, TASK } from './fixtures'

const CREDS = { accessToken: 'twenty_test_key' }
/** Documented: "default: 60, max: 200". */
const MAX = 200
const DEFAULT = 60

type ListMethod = 'listContacts' | 'listCompanies' | 'listDeals' | 'listNotes' | 'listActivities'
type GetMethod = 'getContact' | 'getCompany' | 'getDeal' | 'getNote' | 'getActivity'

const CASES: {
  list: ListMethod
  get: GetMethod
  plural: string
  singular: string
  sample: Record<string, unknown>
}[] = [
  { list: 'listContacts', get: 'getContact', plural: 'people', singular: 'person', sample: PERSON },
  {
    list: 'listCompanies',
    get: 'getCompany',
    plural: 'companies',
    singular: 'company',
    sample: COMPANY,
  },
  {
    list: 'listDeals',
    get: 'getDeal',
    plural: 'opportunities',
    singular: 'opportunity',
    sample: OPPORTUNITY,
  },
  { list: 'listNotes', get: 'getNote', plural: 'notes', singular: 'note', sample: NOTE },
  { list: 'listActivities', get: 'getActivity', plural: 'tasks', singular: 'task', sample: TASK },
]

const DOCUMENTED = new Set(['limit', 'starting_after'])

/**
 * A fake Twenty that honours ONLY `limit` (clamped to 200, 60 when absent) and
 * `starting_after` (an opaque cursor from a previous `pageInfo.endCursor`), and
 * only with the Bearer header. Anything else is refused.
 */
function fakeTwenty(
  plural: string,
  sample: Record<string, unknown>,
  total: number,
  host = 'https://api.twenty.com',
) {
  const rows = Array.from({ length: total }, (_, i) => ({ ...sample, id: `r${i + 1}` }))
  const sent: URL[] = []
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    const headers = new Headers(init?.headers)
    if (headers.get('authorization') !== `Bearer ${CREDS.accessToken}`) {
      return new Response('{"message":"Missing authentication token"}', { status: 403 })
    }
    if (`${url.protocol}//${url.host}` !== host || (init?.method ?? 'GET') !== 'GET') {
      return new Response(`unexpected ${init?.method} ${url}`, { status: 404 })
    }
    sent.push(url)
    const one = url.pathname.match(new RegExp(`^/rest/${plural}/([^/]+)$`))
    if (one) {
      const row = rows.find((r) => r.id === decodeURIComponent(one[1]!))
      return row
        ? Response.json({ data: { [singularOf(plural)]: row } })
        : new Response('{"message":"Record not found"}', { status: 404 })
    }
    if (url.pathname !== `/rest/${plural}`) {
      return new Response(`{"message":"Cannot GET ${url.pathname}"}`, { status: 404 })
    }
    for (const k of url.searchParams.keys()) {
      if (!DOCUMENTED.has(k)) return new Response(`unknown param ${k}`, { status: 400 })
    }
    const rawLimit = url.searchParams.get('limit')
    const limit = rawLimit === null ? DEFAULT : Math.min(Number(rawLimit), MAX)
    const after = url.searchParams.get('starting_after')
    const offset = after === null ? 0 : Number(Buffer.from(after, 'base64url').toString()) + 1
    const data = rows.slice(offset, offset + limit)
    const cursor = (i: number) => Buffer.from(String(i)).toString('base64url')
    return Response.json({
      data: { [plural]: data },
      totalCount: total,
      pageInfo: {
        hasNextPage: offset + limit < total,
        hasPreviousPage: offset > 0,
        startCursor: data.length ? cursor(offset) : null,
        endCursor: data.length ? cursor(offset + data.length - 1) : null,
      },
    })
  })
  return { sent, spy }
}

function singularOf(plural: string): string {
  return CASES.find((c) => c.plural === plural)!.singular
}

const ids = (from: number, n: number) => Array.from({ length: n }, (_, i) => `r${from + i}`)

async function list(
  method: ListMethod,
  params: QueryParams,
  creds: Record<string, unknown> = CREDS,
) {
  return (await new TwentyAdapter()[method](creds as typeof CREDS, params)) as { id: string }[]
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe.each(CASES)('twenty $list', ({ list: method, get, plural, singular, sample }) => {
  it(`pages 1..3 of 2L+1 rows from GET /rest/${plural}: every id once, exact hasMore`, async () => {
    const L = 5
    const { sent } = fakeTwenty(plural, sample, 2 * L + 1)
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    const totals: (number | undefined)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      seen.push(...(await list(method, params)).map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
      totals.push(readUpstreamPage(params)?.totalCount)
    }
    expect(seen).toEqual(ids(1, 2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
    expect(totals).toEqual([11, 11, 11])
    expect(sent).toHaveLength(3)
    expect(sent.every((u) => u.searchParams.get('limit') === String(L))).toBe(true)
  })

  it('the page-2 request carries starting_after = page 1 endCursor', async () => {
    const { sent } = fakeTwenty(plural, sample, 11)
    await list(method, withPageSink({ page: 1, limit: 5 }))
    await list(method, withPageSink({ page: 2, limit: 5 }))
    expect(sent[0]!.searchParams.get('starting_after')).toBeNull()
    expect(sent[1]!.searchParams.get('starting_after')).toBe(Buffer.from('4').toString('base64url'))
  })

  it('page 2 cold walks from page 1', async () => {
    fakeTwenty(plural, sample, 11)
    expect((await list(method, withPageSink({ page: 2, limit: 5 }))).map((r) => r.id)).toEqual(
      ids(6, 5),
    )
  })

  it('a page past the end is empty with hasMore false', async () => {
    fakeTwenty(plural, sample, 3)
    const params = withPageSink({ page: 2, limit: 5 })
    expect(await list(method, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('a limit above 200 is clamped, reported as pageSize, and still serves every row', async () => {
    const total = 2 * MAX + 1
    const { sent } = fakeTwenty(plural, sample, total)
    const seen: string[] = []
    for (let page = 1; page <= 4; page++) {
      const params = withPageSink({ page, limit: 250 })
      seen.push(...(await list(method, params)).map((r) => r.id))
      expect(readUpstreamPage(params)?.pageSize).toBe(MAX)
      if (readUpstreamPage(params)?.hasMore === false) break
    }
    expect(seen).toEqual(ids(1, total))
    expect(sent.every((u) => u.searchParams.get('limit') === String(MAX))).toBe(true)
  })

  it('does not report pageSize when the caller limit fits', async () => {
    fakeTwenty(plural, sample, 3)
    const params = withPageSink({ page: 1, limit: 5 })
    await list(method, params)
    expect(readUpstreamPage(params)?.pageSize).toBeUndefined()
  })

  it('sends no search or filter params it was not documented for', async () => {
    const { sent } = fakeTwenty(plural, sample, 3)
    await list(method, withPageSink({ page: 1, limit: 5, search: 'acme' } as QueryParams))
    expect([...sent[0]!.searchParams.keys()].sort()).toEqual(['limit'])
  })

  it('a self-hosted instanceUrl replaces the cloud host', async () => {
    const { sent } = fakeTwenty(plural, sample, 3, 'https://crm.example.org')
    const rows = await list(method, withPageSink({ page: 1, limit: 5 }), {
      ...CREDS,
      extra: { instanceUrl: 'https://crm.example.org/' },
    })
    expect(rows.map((r) => r.id)).toEqual(ids(1, 3))
    expect(sent[0]!.pathname).toBe(`/rest/${plural}`)
  })

  it('an envelope without data.<plural> is an error, not an empty page', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({ data: {}, totalCount: 0, pageInfo: { hasNextPage: false } }),
    )
    await expect(list(method, withPageSink({ page: 1, limit: 5 }))).rejects.toThrow(plural)
  })

  it(`${get} reads GET /rest/${plural}/{id} and unwraps data.${singular}`, async () => {
    const { sent } = fakeTwenty(plural, sample, 3)
    const one = (await new TwentyAdapter()[get](CREDS, 'r2')) as { id: string }
    expect(one.id).toBe('r2')
    expect(sent[0]!.pathname).toBe(`/rest/${plural}/r2`)
  })
})

describe('twenty pager keys and guards', () => {
  it('a cursor minted at one limit is not reused at another', async () => {
    const { sent } = fakeTwenty('people', PERSON, 11)
    await list('listContacts', withPageSink({ page: 1, limit: 5 }))
    const rows = await list('listContacts', withPageSink({ page: 2, limit: 3 }))
    expect(rows.map((r) => r.id)).toEqual(ids(4, 3))
    expect(sent.at(-1)!.searchParams.get('starting_after')).toBe(
      Buffer.from('2').toString('base64url'),
    )
  })

  it('cursors are scoped to one connection: another workspace walks from its own page 1', async () => {
    const hostCursor = (host: string) => `cursor-for-${host}`
    const sent: URL[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input))
      sent.push(url)
      const after = url.searchParams.get('starting_after')
      if (after !== null && after !== hostCursor(url.host)) {
        return new Response('{"message":"Invalid cursor"}', { status: 400 })
      }
      const prefix = url.host.replace(/\W/g, '')
      return Response.json({
        data: { people: [{ ...PERSON, id: `${prefix}-${after === null ? 1 : 2}` }] },
        totalCount: 2,
        pageInfo: {
          hasNextPage: after === null,
          endCursor: after === null ? hostCursor(url.host) : null,
        },
      })
    })
    await list('listContacts', withPageSink({ page: 1, limit: 1 }))
    const other = { ...CREDS, extra: { instanceUrl: 'https://crm.example.org' } }
    const rows = await list('listContacts', withPageSink({ page: 2, limit: 1 }), other)
    expect(rows.map((r) => r.id)).toEqual(['crmexampleorg-2'])
    const toOther = sent.filter((u) => u.host === 'crm.example.org')
    expect(toOther.map((u) => u.searchParams.get('starting_after'))).toEqual([
      null,
      'cursor-for-crm.example.org',
    ])
  })

  it('hasNextPage without an endCursor is an error, not a silent end', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        data: { people: [PERSON] },
        totalCount: 5,
        pageInfo: { hasNextPage: true, endCursor: null },
      }),
    )
    await expect(list('listContacts', withPageSink({ page: 1, limit: 1 }))).rejects.toThrow(
      /hasNextPage without an endCursor/,
    )
  })

  it('a non-positive limit is not sent upstream', async () => {
    const { sent } = fakeTwenty('people', PERSON, 3)
    await list('listContacts', withPageSink({ page: 1, limit: 0 }))
    expect(sent[0]!.searchParams.has('limit')).toBe(false)
  })

  it('get encodes the id into one path segment', async () => {
    const sent: string[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      sent.push(new URL(String(input)).pathname)
      return Response.json({ data: { person: { ...PERSON, id: 'a/b' } } })
    })
    await new TwentyAdapter().getContact(CREDS, 'a/b')
    expect(sent).toEqual(['/rest/people/a%2Fb'])
  })
})

describe('twenty listPipelines', () => {
  it('refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    await expect(
      new TwentyAdapter().listPipelines(CREDS, withPageSink({ page: 1, limit: 5 })),
    ).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('twenty capabilities', () => {
  it('declares the documented page maximum', () => {
    expect(new TwentyAdapter().capabilities.maxPageSize).toBe(MAX)
  })
})

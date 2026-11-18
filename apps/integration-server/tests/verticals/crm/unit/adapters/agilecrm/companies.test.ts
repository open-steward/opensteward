/**
 * AgileCRM companies and activities.
 *
 * Companies are listed by README 2.3 "Get list of companies":
 * `dev/api/contacts/companies/list`, Method: POST, "Page_size,global_sort_key
 * and cursor should be sent as a form parameter (Content-Type:
 * application/x-www-form-urlencoded ).Paging can be applied using the
 * page_size and cursor form parameters. Cursor for the next page will be in
 * the last company of the list. If there is no cursor, it means that it is the
 * end of list." One is read back by 2.4: `dev/api/contacts/{id}`, Method: GET.
 * The adapter once called GET /companies, which is documented nowhere.
 *
 * The REST API documents no activity resource, so listActivities refuses.
 *
 * The fake upstream honours ONLY the documented shape: a POST whose form body
 * carries page_size, global_sort_key and cursor, and nothing in the query.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _resetCursorPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type Credentials,
} from '@opensteward/shared'
import { CompanySchema } from '../../../../../../src/verticals/crm/schema/company'
import { AgileCrmAdapter } from '../../../../../../src/verticals/crm/adapters/agilecrm/index'

const creds: Credentials = {
  accessToken: 'api-key',
  extra: { email: 'me@example.test', domain: 'acme' },
} as Credentials

interface Seen {
  method: string
  host: string
  path: string
  query: URLSearchParams
  contentType: string | null
  form: URLSearchParams
}

let seen: Seen[] = []

const LIST_PATH = '/dev/api/contacts/companies/list'
const DOCUMENTED_FORM_KEYS = new Set(['page_size', 'global_sort_key', 'cursor'])

/** A documented-shape company (README 2.3 example response). */
const company = (i: number): Record<string, unknown> => ({
  id: i,
  type: 'COMPANY',
  created_time: 1439390694,
  updated_time: 0,
  star_value: 0,
  lead_score: 0,
  tags: [],
  tagsWithTime: [],
  properties: [
    { type: 'SYSTEM', name: 'name', value: `company ${i}` },
    { type: 'SYSTEM', name: 'name_lower', value: `company ${i}` },
  ],
})

/**
 * Companies paged by cursor "<prefix><offset>" on the last row, read only from
 * the documented form body; any other form key is rejected.
 */
function companyList(n: number, prefix = 'c', firstId = 1) {
  const rows = Array.from({ length: n }, (_, i) => company(i + firstId))
  return (form: URLSearchParams): Record<string, unknown>[] => {
    for (const k of form.keys()) {
      if (!DOCUMENTED_FORM_KEYS.has(k)) throw new Error(`undocumented form parameter: ${k}`)
    }
    const size = Number(form.get('page_size') ?? '25')
    const cursor = form.get('cursor')
    let start = 0
    if (cursor !== null) {
      const m = new RegExp(`^${prefix}(\\d+)$`).exec(cursor)
      if (!m) throw new Error(`undocumented cursor value: ${cursor}`)
      start = Number(m[1])
    }
    const page = rows.slice(start, start + size).map((r) => ({ ...r }))
    const end = start + page.length
    if (page.length > 0 && end < rows.length) page[page.length - 1]!['cursor'] = `${prefix}${end}`
    return page
  }
}

type Route = (form: URLSearchParams, s: Seen) => unknown

function install(routes: Record<string, Route>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const url = new URL(input)
      const headers = (init.headers ?? {}) as Record<string, string>
      const s: Seen = {
        method: init.method ?? 'GET',
        host: url.hostname,
        path: url.pathname,
        query: url.searchParams,
        contentType: headers['Content-Type'] ?? null,
        form: new URLSearchParams(typeof init.body === 'string' ? init.body : ''),
      }
      seen.push(s)
      const route = routes[`${s.method} ${s.host}${s.path}`] ?? routes[`${s.method} ${s.path}`]
      if (!route) return new Response('not found', { status: 404 })
      return new Response(JSON.stringify(route(s.form, s)), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }),
  )
}

/** The documented list call: POST, form-encoded, nothing in the query. */
function listRoute(n: number, prefix = 'c', firstId = 1): Route {
  const list = companyList(n, prefix, firstId)
  return (form, s) => {
    if (s.contentType !== 'application/x-www-form-urlencoded') {
      throw new Error(`list must be form-encoded, got ${s.contentType}`)
    }
    if ([...s.query.keys()].length > 0) throw new Error('list takes no query parameters')
    return list(form)
  }
}

beforeEach(() => {
  seen = []
  _resetCursorPager()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('agilecrm listCompanies pages the documented form-POST list by cursor', () => {
  const L = 3
  const N = 2 * L + 1

  it('serves every company once, in order, with exact hasMore', async () => {
    install({ [`POST ${LIST_PATH}`]: listRoute(N) })
    const adapter = new AgileCrmAdapter()
    const ids: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listCompanies(creds, params)
      for (const r of rows) CompanySchema.parse(r)
      ids.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(ids).toEqual(Array.from({ length: N }, (_, i) => String(i + 1)))
    expect(more).toEqual([true, true, false])
  })

  it('POSTs page_size and the documented sort key as a form, with no cursor on page 1', async () => {
    install({ [`POST ${LIST_PATH}`]: listRoute(N) })
    const adapter = new AgileCrmAdapter()
    await adapter.listCompanies(creds, withPageSink({ page: 1, limit: L }))
    await adapter.listCompanies(creds, withPageSink({ page: 2, limit: L }))
    expect(seen[0]!.method).toBe('POST')
    expect(seen[0]!.host).toBe('acme.agilecrm.com')
    expect(seen[0]!.path).toBe(LIST_PATH)
    expect(seen[0]!.contentType).toBe('application/x-www-form-urlencoded')
    expect(seen[0]!.form.has('cursor')).toBe(false)
    expect(seen[0]!.form.get('page_size')).toBe(String(L))
    expect(seen[0]!.form.get('global_sort_key')).toBe('-created_time')
    expect(seen[1]!.form.get('cursor')).toBe(`c${L}`)
    expect(seen[1]!.form.get('page_size')).toBe(String(L))
  })

  it('reaches page 2 cold by walking from page 1', async () => {
    install({ [`POST ${LIST_PATH}`]: listRoute(N) })
    const rows = await new AgileCrmAdapter().listCompanies(
      creds,
      withPageSink({ page: 2, limit: L }),
    )
    expect(rows.map((r) => r.id)).toEqual(['4', '5', '6'])
  })

  it('an empty cursor on the last company ends the list', async () => {
    install({ [`POST ${LIST_PATH}`]: () => [{ ...company(1), cursor: '' }] })
    const params = withPageSink({ page: 1, limit: L })
    const rows = await new AgileCrmAdapter().listCompanies(creds, params)
    expect(rows.map((r) => r.id)).toEqual(['1'])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('each connection walks its own cursors', async () => {
    const other: Credentials = {
      accessToken: 'other-key',
      extra: { email: 'you@example.test', domain: 'other' },
    } as Credentials
    install({
      [`POST acme.agilecrm.com${LIST_PATH}`]: listRoute(N),
      [`POST other.agilecrm.com${LIST_PATH}`]: listRoute(N, 'b', 101),
    })
    const adapter = new AgileCrmAdapter()
    await adapter.listCompanies(creds, withPageSink({ page: 1, limit: L }))
    await adapter.listCompanies(creds, withPageSink({ page: 2, limit: L }))
    const rows = await adapter.listCompanies(other, withPageSink({ page: 2, limit: L }))
    expect(rows.map((r) => r.id)).toEqual(['104', '105', '106'])
  })

  it('the same API key on two account domains keeps separate cursors', async () => {
    const sameKeyOtherDomain: Credentials = {
      accessToken: 'api-key',
      extra: { email: 'me@example.test', domain: 'other' },
    } as Credentials
    install({
      [`POST acme.agilecrm.com${LIST_PATH}`]: listRoute(N),
      [`POST other.agilecrm.com${LIST_PATH}`]: listRoute(N, 'b', 101),
    })
    const adapter = new AgileCrmAdapter()
    await adapter.listCompanies(creds, withPageSink({ page: 1, limit: L }))
    await adapter.listCompanies(creds, withPageSink({ page: 2, limit: L }))
    const rows = await adapter.listCompanies(
      sameKeyOtherDomain,
      withPageSink({ page: 2, limit: L }),
    )
    expect(rows.map((r) => r.id)).toEqual(['104', '105', '106'])
  })

  it('through the API path, meta.hasMore is exact', async () => {
    install({ [`POST ${LIST_PATH}`]: listRoute(N) })
    const adapter = new AgileCrmAdapter()
    const first = parseListQuery({ limit: String(L), page: '1' })
    const env = listPage(await adapter.listCompanies(creds, first), first, 'agilecrm')
    expect(env.meta.hasMore).toBe(true)
    const last = parseListQuery({ limit: String(L), page: '3' })
    const envLast = listPage(await adapter.listCompanies(creds, last), last, 'agilecrm')
    expect(envLast.meta.hasMore).toBe(false)
    expect(envLast.data.map((r) => r.id)).toEqual([String(N)])
  })
})

describe('agilecrm getCompany reads the documented contacts/{id} path', () => {
  it('returns a COMPANY record', async () => {
    install({ 'GET /dev/api/contacts/5638758711951360': () => company(5638758711951360) })
    const out = await new AgileCrmAdapter().getCompany(creds, '5638758711951360')
    expect(CompanySchema.parse(out).id).toBe('5638758711951360')
    expect(seen.map((s) => `${s.method} ${s.path}`)).toEqual([
      'GET /dev/api/contacts/5638758711951360',
    ])
  })

  it('a PERSON id is not a company: 404', async () => {
    install({ 'GET /dev/api/contacts/9': () => ({ ...company(9), type: 'PERSON' }) })
    await expect(new AgileCrmAdapter().getCompany(creds, '9')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

describe('agilecrm listActivities', () => {
  it('refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    install({})
    await expect(
      new AgileCrmAdapter().listActivities(creds, withPageSink({ page: 1, limit: 3 })),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(seen).toEqual([])
  })
})

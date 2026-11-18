/**
 * Scoro request shapes against the first-party API v2 reference,
 * https://api.scoro.com/api/v2:
 *
 *   "https://#companyname#.scoro.com/api/v2/#module#(/#action#)(/#id#)"
 *   "#companyname# is the subdomain"
 *   "All API requests are composed of light-weight JSON delivered as an HTTP
 *    POST request to the endpoint URL."
 *   "All requests should contain at least the following values: apiKey OR
 *    user_token - a unique key used for authentication; company_account_id -
 *    specifies which business entity’s data is used"
 *   "A maximum of 100 results will be returned for list methods, regardless of
 *    the value sent with the per_page parameter. The page paramater can be used
 *    to request additional items."
 *   "List results can be filtered by adding a filter object to the request.
 *    This filter object should have field names as keys and search words as
 *    values."
 *   Contacts: contact_type "possible values are \"person\" or \"company\""
 *   Comments list: "Fields \"module\" and \"object_id\" are mandatory."
 *   Tasks: "Use 'include_subtasks = 1' in request object to get subtask
 *    objects to response as well. By default, subtasks are not included."
 *    The tasks/list example sends it at the top level instead:
 *    { ..., "request": {}, "include_subtasks": 1 }. The fake honours either.
 *   Errors: "HTTP/1.1 200" with "status": "ERROR", "statusCode": "403".
 *
 * The fake below honours only those documented parameters.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { readUpstreamPage, withPageSink, type QueryParams } from '@opensteward/shared'
import { ScoroAdapter } from '../../../../../../src/verticals/crm/adapters/scoro/index'

const CREDS = {
  accessToken: 'API_hash',
  extra: { subdomain: 'tutorial', companyAccountId: 'tutorial' },
}

interface Sent {
  url: URL
  method: string
  body: Record<string, unknown>
}

type Row = Record<string, unknown>

/** A Scoro site holding `rows` per module; pages exactly as documented. */
function fakeScoro(tables: Record<string, Row[]>) {
  const sent: Sent[] = []
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
    sent.push({ url, method: init?.method ?? 'GET', body })
    const json = (x: unknown) =>
      new Response(JSON.stringify(x), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    if (body['apiKey'] !== 'API_hash') {
      return json({ status: 'ERROR', statusCode: '403', messages: { error: ['Wrong Api Key'] } })
    }
    const m = /^\/api\/v2\/([A-Za-z]+)\/(list|view)(?:\/(.+))?$/.exec(url.pathname)
    if (!m || init?.method !== 'POST' || !(m[1]! in tables))
      return new Response('not found', { status: 404 })
    let rows = tables[m[1]!]!
    const filter = body['filter'] as Record<string, unknown> | undefined
    if (filter) rows = rows.filter((r) => Object.entries(filter).every(([k, v]) => r[k] === v))
    const request = (body['request'] ?? {}) as Record<string, unknown>
    if (m[1] === 'tasks' && body['include_subtasks'] !== 1 && request['include_subtasks'] !== 1) {
      rows = rows.filter((r) => r['parent_id'] == null)
    }
    if (m[2] === 'view') {
      const idKey = m[1] === 'contacts' ? 'contact_id' : m[1] === 'tasks' ? 'event_id' : 'id'
      const row = tables[m[1]!]!.find((r) => String(r[idKey]) === decodeURIComponent(m[3]!))
      return json(
        row
          ? { status: 'OK', statusCode: 200, messages: null, data: row }
          : { status: 'ERROR', statusCode: '404', messages: { error: ['Not found'] } },
      )
    }
    const perPage = Math.min(Number(body['per_page'] ?? 10), 100)
    const page = Number(body['page'] ?? 1)
    return json({
      status: 'OK',
      statusCode: 200,
      messages: null,
      data: rows.slice((page - 1) * perPage, page * perPage),
    })
  })
  return { sent, spy }
}

afterEach(() => {
  vi.restoreAllMocks()
})

const person = (i: number): Row => ({ contact_id: i, name: `P${i}`, contact_type: 'person' })
const company = (i: number): Row => ({ contact_id: i, name: `C${i}`, contact_type: 'company' })
const quote = (i: number): Row => ({ id: i, quote_name: `Q${i}`, currency: 'EUR', sum: i })
const task = (i: number): Row => ({ event_id: i, event_name: `T${i}` })

/** Walks pages until a short one; every id must come back exactly once. */
async function walk(
  fn: (params: QueryParams) => Promise<Array<{ id: string }>>,
  limit: number,
): Promise<{ ids: string[]; pages: number; reports: unknown[] }> {
  const ids: string[] = []
  const reports: unknown[] = []
  for (let page = 1; page < 50; page++) {
    const params = withPageSink({ page, limit })
    const rows = await fn(params)
    reports.push(readUpstreamPage(params))
    ids.push(...rows.map((r) => r.id))
    if (rows.length < Math.min(limit, 100)) return { ids, pages: page, reports }
  }
  throw new Error('walk did not end')
}

describe('scoro host, auth and envelope', () => {
  it('POSTs contacts/list to the account subdomain with apiKey, company_account_id, per_page, page and a person filter', async () => {
    const { sent } = fakeScoro({ contacts: [person(1)] })
    await new ScoroAdapter().listContacts(CREDS, withPageSink({ page: 2, limit: 7 }))
    expect(sent).toHaveLength(1)
    expect(sent[0]!.method).toBe('POST')
    expect(sent[0]!.url.href).toBe('https://tutorial.scoro.com/api/v2/contacts/list')
    expect(sent[0]!.body).toEqual({
      apiKey: 'API_hash',
      company_account_id: 'tutorial',
      per_page: 7,
      page: 2,
      request: {},
      filter: { contact_type: 'person' },
    })
  })

  it('never sends the account in the path on api.scoro.com', async () => {
    const { sent } = fakeScoro({ quotes: [] })
    await new ScoroAdapter().listDeals(CREDS, withPageSink({ page: 1, limit: 5 }))
    expect(sent[0]!.url.host).toBe('tutorial.scoro.com')
    expect(sent[0]!.url.pathname).toBe('/api/v2/quotes/list')
  })

  it('refuses a connection with no subdomain or company_account_id before sending anything', async () => {
    const { spy } = fakeScoro({ contacts: [] })
    const a = new ScoroAdapter()
    await expect(
      a.listContacts({ accessToken: 'API_hash' }, withPageSink({ page: 1, limit: 5 })),
    ).rejects.toThrow(/subdomain/)
    await expect(
      a.listContacts(
        { accessToken: 'API_hash', extra: { subdomain: 'tutorial' } },
        withPageSink({ page: 1, limit: 5 }),
      ),
    ).rejects.toThrow(/company_account_id/)
    await expect(
      a.listContacts(
        { accessToken: 'API_hash', extra: { subdomain: 'evil.example/x', companyAccountId: 't' } },
        withPageSink({ page: 1, limit: 5 }),
      ),
    ).rejects.toThrow(/subdomain/)
    expect(spy).not.toHaveBeenCalled()
  })

  it('throws the documented error envelope (HTTP 200, status ERROR) instead of reading an empty page', async () => {
    fakeScoro({ contacts: [person(1)] })
    const bad = { ...CREDS, accessToken: 'wrong' }
    await expect(
      new ScoroAdapter().listContacts(bad, withPageSink({ page: 1, limit: 5 })),
    ).rejects.toMatchObject({
      statusCode: 403,
    })
  })

  it('throws 502 when a list response has no data array', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ status: 'OK', statusCode: 200, messages: null }), {
        status: 200,
      }),
    )
    await expect(
      new ScoroAdapter().listActivities(CREDS, withPageSink({ page: 1, limit: 5 })),
    ).rejects.toMatchObject({
      statusCode: 502,
      code: 'UPSTREAM_ERROR',
    })
  })

  it('declares the documented max page size of 100', () => {
    expect(new ScoroAdapter().capabilities.maxPageSize).toBe(100)
  })
})

describe('scoro credential form', () => {
  it('collects subdomain, company_account_id and apiKey into extra', async () => {
    const a = new ScoroAdapter()
    expect(a.credentialFields().map((f) => f.name)).toEqual([
      'subdomain',
      'companyAccountId',
      'apiKey',
    ])
    await expect(
      a.exchangeCredentials({
        subdomain: ' Tutorial ',
        companyAccountId: 'tutorial',
        apiKey: 'API_hash',
      }),
    ).resolves.toEqual({
      accessToken: 'API_hash',
      extra: { subdomain: 'tutorial', companyAccountId: 'tutorial' },
    })
    await expect(
      a.exchangeCredentials({ subdomain: 'a.b', companyAccountId: 'x', apiKey: 'k' }),
    ).rejects.toThrow(/subdomain/)
    await expect(
      a.exchangeCredentials({ subdomain: 'a', companyAccountId: '', apiKey: 'k' }),
    ).rejects.toThrow(/Company account/)
  })
})

describe('scoro paging walks (N = 2L + 1)', () => {
  const L = 5
  const N = 2 * L + 1

  it('listContacts serves every person once and skips companies', async () => {
    const rows = [...Array.from({ length: N }, (_, i) => person(i + 1)), company(900), company(901)]
    const { sent } = fakeScoro({ contacts: rows })
    const a = new ScoroAdapter()
    const { ids, pages, reports } = await walk((p) => a.listContacts(CREDS, p), L)
    expect(ids).toEqual(Array.from({ length: N }, (_, i) => String(i + 1)))
    expect(pages).toBe(3)
    expect(sent.map((s) => s.body['page'])).toEqual([1, 2, 3])
    expect(sent.every((s) => s.body['per_page'] === L)).toBe(true)
    // No total or has-more field is documented: nothing is claimed.
    expect(reports).toEqual([undefined, undefined, undefined])
  })

  it('listCompanies walks contacts/list filtered to contact_type company', async () => {
    const rows = [person(900), ...Array.from({ length: N }, (_, i) => company(i + 1))]
    const { sent } = fakeScoro({ contacts: rows })
    const a = new ScoroAdapter()
    const { ids } = await walk((p) => a.listCompanies(CREDS, p), L)
    expect(ids).toEqual(Array.from({ length: N }, (_, i) => String(i + 1)))
    expect(sent.every((s) => s.url.pathname === '/api/v2/contacts/list')).toBe(true)
    expect(
      sent.every(
        (s) => (s.body['filter'] as Record<string, unknown>)['contact_type'] === 'company',
      ),
    ).toBe(true)
  })

  it('listDeals walks quotes/list', async () => {
    fakeScoro({ quotes: Array.from({ length: N }, (_, i) => quote(i + 1)) })
    const a = new ScoroAdapter()
    const { ids } = await walk((p) => a.listDeals(CREDS, p), L)
    expect(ids).toEqual(Array.from({ length: N }, (_, i) => String(i + 1)))
  })

  it('listActivities walks tasks/list', async () => {
    const { sent } = fakeScoro({ tasks: Array.from({ length: N }, (_, i) => task(i + 1)) })
    const a = new ScoroAdapter()
    const { ids } = await walk((p) => a.listActivities(CREDS, p), L)
    expect(ids).toEqual(Array.from({ length: N }, (_, i) => String(i + 1)))
    expect(sent.every((s) => s.url.pathname === '/api/v2/tasks/list')).toBe(true)
  })

  it('listActivities asks for subtasks in both documented placements and serves them', async () => {
    // Every third task is a subtask of the one before it (parent_id set).
    const rows = Array.from({ length: N }, (_, i) =>
      (i + 1) % 3 === 0 ? { ...task(i + 1), parent_id: i } : task(i + 1),
    )
    const { sent } = fakeScoro({ tasks: rows })
    const a = new ScoroAdapter()
    const { ids } = await walk((p) => a.listActivities(CREDS, p), L)
    expect(ids).toEqual(Array.from({ length: N }, (_, i) => String(i + 1)))
    for (const s of sent) {
      expect(s.body['include_subtasks']).toBe(1)
      expect(s.body['request']).toEqual({ include_subtasks: 1 })
    }
  })

  it('clamps a limit over 100 to per_page 100 and reports the size sent', async () => {
    const total = 2 * 100 + 1
    const { sent } = fakeScoro({ tasks: Array.from({ length: total }, (_, i) => task(i + 1)) })
    const a = new ScoroAdapter()
    const { ids, reports } = await walk((p) => a.listActivities(CREDS, p), 150)
    expect(ids).toEqual(Array.from({ length: total }, (_, i) => String(i + 1)))
    expect(sent.every((s) => s.body['per_page'] === 100)).toBe(true)
    expect(reports).toEqual([{ pageSize: 100 }, { pageSize: 100 }, { pageSize: 100 }])
  })
})

describe('scoro single reads', () => {
  it('getContact POSTs contacts/view/{id} and rejects a company id', async () => {
    const { sent } = fakeScoro({ contacts: [person(1), company(2)] })
    const a = new ScoroAdapter()
    expect((await a.getContact(CREDS, '1')).id).toBe('1')
    expect(sent[0]!.method).toBe('POST')
    expect(sent[0]!.url.href).toBe('https://tutorial.scoro.com/api/v2/contacts/view/1')
    expect(sent[0]!.body).toEqual({
      apiKey: 'API_hash',
      company_account_id: 'tutorial',
      request: {},
    })
    await expect(a.getContact(CREDS, '2')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('getCompany reads contacts/view/{id} and rejects a person id', async () => {
    const { sent } = fakeScoro({ contacts: [person(1), company(2)] })
    const a = new ScoroAdapter()
    expect((await a.getCompany(CREDS, '2')).name).toBe('C2')
    expect(sent[0]!.url.pathname).toBe('/api/v2/contacts/view/2')
    await expect(a.getCompany(CREDS, '1')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('getDeal and getActivity read quotes/view and tasks/view', async () => {
    const { sent } = fakeScoro({ quotes: [quote(12)], tasks: [task(48)] })
    const a = new ScoroAdapter()
    expect((await a.getDeal(CREDS, '12')).title).toBe('Q12')
    expect((await a.getActivity(CREDS, '48')).subject).toBe('T48')
    expect(sent.map((s) => s.url.pathname)).toEqual([
      '/api/v2/quotes/view/12',
      '/api/v2/tasks/view/48',
    ])
  })

  it('encodes the id into the view path', async () => {
    const { sent } = fakeScoro({ quotes: [] })
    await expect(new ScoroAdapter().getDeal(CREDS, '1/delete/2')).rejects.toMatchObject({
      statusCode: 404,
    })
    expect(sent[0]!.url.pathname).toBe('/api/v2/quotes/view/1%2Fdelete%2F2')
  })

  it('surfaces a view error envelope as its statusCode', async () => {
    fakeScoro({ tasks: [] })
    await expect(new ScoroAdapter().getActivity(CREDS, '9')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

describe('scoro refusals send no request', () => {
  it.each([
    [
      'listPipelines',
      (a: ScoroAdapter) => a.listPipelines(CREDS, withPageSink({ page: 1, limit: 10 })),
      /pipelines/,
    ],
    [
      'listNotes',
      (a: ScoroAdapter) => a.listNotes(CREDS, withPageSink({ page: 1, limit: 10 })),
      /"module" and "object_id" are mandatory/,
    ],
    ['getNote', (a: ScoroAdapter) => a.getNote(CREDS, '301'), /list, modify and delete/],
  ])('%s throws 501 NOT_SUPPORTED', async (_name, call, message) => {
    const { spy } = fakeScoro({})
    const err = await call(new ScoroAdapter()).catch((e: unknown) => e)
    expect(err).toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect((err as Error).message).toMatch(message)
    expect(spy).not.toHaveBeenCalled()
  })
})

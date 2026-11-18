import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetCursorPager, readUpstreamPage, withPageSink } from '@opensteward/shared'
import { ForceManagerAdapter } from '../../../../../../src/verticals/crm/adapters/forcemanager/index'
import {
  ACCOUNT,
  ACTIVITY,
  CONTACT,
  CURRENCIES,
  LOGIN,
  OPPORTUNITY,
  OPPORTUNITY_STATUS,
  OPPORTUNITY_STATUSES,
  OPPORTUNITY_TYPE,
} from './fixtures'

/**
 * A fake ForceManager v4 honouring only what https://developer.forcemanager.com/openapi.json
 * documents:
 *   - POST /login {"username":"YOUR_PUBLIC_KEY","password":"YOUR_PRIVATE_KEY"} → {"token": …}
 *   - every other call needs that token in X-Session-Key
 *   - lists: `page` query param, 0-based ("the first page is 0"); page size from the
 *     `Count` / `X-FM-Entity-Count` header, default 50; `[]` past the last page
 *   - GET /<entity>/{ID} returns one object
 */
const BASE = 'https://api.forcemanager.com/api/v4'
const creds = { accessToken: 'PUB', extra: { privateKey: 'PRIV' } }

interface Seen {
  method: string
  url: URL
  headers: Record<string, string>
  body?: unknown
}
let seen: Seen[] = []
let collections: Record<string, Record<string, unknown>[]> = {}
let records: Record<string, Record<string, unknown>> = {}
/** When set, the fake ignores the size header and serves pages of this many rows. */
let forcedPageSize: number | undefined

function install(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const url = new URL(input)
      const headers = Object.fromEntries(
        Object.entries((init.headers ?? {}) as Record<string, string>),
      )
      const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined
      const method = init.method ?? 'GET'
      seen.push({ method, url, headers, body })
      const json = (v: unknown, status = 200) =>
        new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } })
      if (!url.href.startsWith(`${BASE}/`)) return json({ error: 'wrong host' }, 404)
      const path = url.pathname.slice('/api/v4'.length)
      if (method === 'POST' && path === '/login') {
        const ok = body?.username === 'PUB' && body?.password === 'PRIV'
        return ok ? json(LOGIN) : json({ error: 'bad keys' }, 401)
      }
      if (headers['X-Session-Key'] !== LOGIN.token) return json({ error: 'no session' }, 401)
      if (method !== 'GET') return json({ error: 'unexpected' }, 405)
      const rows = collections[path]
      if (rows) {
        const page = Number(url.searchParams.get('page') ?? '0')
        const size =
          forcedPageSize ?? Number(headers['Count'] ?? headers['X-FM-Entity-Count'] ?? '50')
        return json(rows.slice(page * size, page * size + size))
      }
      const one = records[path]
      return one ? json(one) : json({ error: 'bad request' }, 400)
    }),
  )
}

function listCalls(path: string): Seen[] {
  return seen.filter((s) => s.url.pathname === `/api/v4${path}`)
}

beforeEach(() => {
  seen = []
  // listPipelines walks the statuses on every call; tests that care set their own.
  collections = { '/opportunityStatuses': [] }
  records = {}
  forcedPageSize = undefined
  _resetCursorPager()
  install()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const rowsOf = (base: Record<string, unknown>, n: number) =>
  Array.from({ length: n }, (_, i) => ({ ...base, id: i + 1 }))

type ListName = 'listContacts' | 'listCompanies' | 'listDeals' | 'listActivities' | 'listPipelines'
const LISTS: Array<[ListName, string, Record<string, unknown>]> = [
  ['listContacts', '/contacts', CONTACT],
  ['listCompanies', '/accounts', ACCOUNT],
  ['listDeals', '/opportunities', { ...OPPORTUNITY, currencyId: null }],
  ['listActivities', '/activities', ACTIVITY],
  ['listPipelines', '/opportunityTypes', OPPORTUNITY_TYPE],
]

describe('forcemanager auth', () => {
  it('logs in with the key pair and sends the token as X-Session-Key', async () => {
    collections['/contacts'] = rowsOf(CONTACT, 1)
    await new ForceManagerAdapter().listContacts(creds, withPageSink({ page: 1, limit: 5 }))
    expect(seen[0]!.method).toBe('POST')
    expect(seen[0]!.url.pathname).toBe('/api/v4/login')
    expect(seen[0]!.body).toEqual({ username: 'PUB', password: 'PRIV' })
    const list = listCalls('/contacts')
    expect(list.length).toBeGreaterThan(0)
    for (const c of list) expect(c.headers['X-Session-Key']).toBe(LOGIN.token)
    // One login per adapter call, however many pages it reads.
    expect(seen.filter((s) => s.url.pathname === '/api/v4/login')).toHaveLength(1)
  })

  it('refuses a connection without the private key before sending anything', async () => {
    await expect(
      new ForceManagerAdapter().listContacts(
        { accessToken: 'PUB' },
        withPageSink({ page: 1, limit: 5 }),
      ),
    ).rejects.toMatchObject({ statusCode: 401 })
    expect(seen).toHaveLength(0)
  })

  it('surfaces a rejected login', async () => {
    await expect(
      new ForceManagerAdapter().getContact(
        { accessToken: 'PUB', extra: { privateKey: 'WRONG' } },
        '287',
      ),
    ).rejects.toMatchObject({ statusCode: 401 })
  })

  it('collects the public and private key on the connect form', async () => {
    const adapter = new ForceManagerAdapter()
    expect(adapter.credentialFields().map((f) => f.name)).toEqual(['publicKey', 'privateKey'])
    await expect(
      adapter.exchangeCredentials({ publicKey: ' PUB ', privateKey: 'PRIV' }),
    ).resolves.toEqual({
      accessToken: 'PUB',
      extra: { privateKey: 'PRIV' },
    })
    await expect(adapter.exchangeCredentials({ publicKey: 'PUB' })).rejects.toThrow(
      /Private API key/,
    )
  })
})

describe.each(LISTS)('forcemanager %s paging over %s', (method, path, base) => {
  const call = (params: ReturnType<typeof withPageSink>) =>
    (
      new ForceManagerAdapter()[method] as (
        c: typeof creds,
        p: typeof params,
      ) => Promise<Array<{ id: string }>>
    )(creds, params)

  it('walks N = 2L+1 rows over pages 1..3: every id once, hasMore exact', async () => {
    const L = 3
    collections[path] = rowsOf(base, 2 * L + 1)
    const ids: string[] = []
    const hasMore: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      ids.push(...(await call(params)).map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(ids).toEqual(['1', '2', '3', '4', '5', '6', '7'])
    expect(hasMore).toEqual([true, true, false])
  })

  it('asks for page 0 first, at the caller limit, with no undocumented params', async () => {
    collections[path] = rowsOf(base, 2)
    await call(withPageSink({ page: 1, limit: 7 }))
    const first = listCalls(path)[0]!
    expect(first.url.searchParams.get('page')).toBe('0')
    expect(first.headers['Count']).toBe('7')
    expect(first.headers['X-FM-Entity-Count']).toBe('7')
    for (const key of ['limit', 'offset', 'per_page', 'count'])
      expect(first.url.searchParams.has(key)).toBe(false)
  })

  it('serves every row once when the upstream pages are uneven (size header not honoured)', async () => {
    forcedPageSize = 2
    collections[path] = rowsOf(base, 7)
    const ids: string[] = []
    const hasMore: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: 3 })
      ids.push(...(await call(params)).map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(ids).toEqual(['1', '2', '3', '4', '5', '6', '7'])
    expect(hasMore).toEqual([true, true, false])
  })

  it('reads an empty collection as one empty last page', async () => {
    collections[path] = []
    const params = withPageSink({ page: 1, limit: 3 })
    expect(await call(params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('treats a non-array list body as an error, never as an empty page', async () => {
    records[path] = { token: 'not a list' }
    await expect(call(withPageSink({ page: 1, limit: 3 }))).rejects.toMatchObject({
      statusCode: 502,
    })
  })
})

describe('forcemanager listPipelines stages', () => {
  it('attaches statuses by idParent from a full walk of /opportunityStatuses', async () => {
    collections['/opportunityTypes'] = [
      { ...OPPORTUNITY_TYPE, id: 1 },
      { ...OPPORTUNITY_TYPE, id: 2 },
    ]
    // 60 statuses: more than the documented default page of 50, so the walk needs page 1 too.
    collections['/opportunityStatuses'] = [
      ...Array.from({ length: 58 }, (_, i) => ({
        ...OPPORTUNITY_STATUSES[0]!,
        id: 1000 + i,
        idParent: null,
      })),
      { ...OPPORTUNITY_STATUS, id: 478, idParent: 1 },
      { ...OPPORTUNITY_STATUS, id: 479, idParent: 2, order: 1 },
    ]
    const out = await new ForceManagerAdapter().listPipelines(
      creds,
      withPageSink({ page: 1, limit: 10 }),
    )
    expect(out.map((p) => [p.id, p.stages!.map((s) => s.id)])).toEqual([
      ['1', ['478']],
      ['2', ['479']],
    ])
    const walk = listCalls('/opportunityStatuses')
    expect(walk.map((c) => c.url.searchParams.get('page'))).toEqual(['0', '1', '2'])
    for (const c of walk) expect(c.headers['Count']).toBeUndefined()
  })

  it('no longer calls the undocumented /pipelines path', async () => {
    collections['/opportunityTypes'] = []
    await new ForceManagerAdapter().listPipelines(creds, withPageSink({ page: 1, limit: 10 }))
    expect(seen.some((s) => s.url.pathname.endsWith('/pipelines'))).toBe(false)
  })
})

describe('forcemanager deal currency', () => {
  it('resolves currencyId to the ISO code from GET /currencies', async () => {
    collections['/opportunities'] = [OPPORTUNITY]
    collections['/currencies'] = CURRENCIES
    const [deal] = await new ForceManagerAdapter().listDeals(
      creds,
      withPageSink({ page: 1, limit: 10 }),
    )
    expect(deal!.value).toEqual({ amount: 34560, currency: 'EUR' })
  })

  it('omits the value when the currency id is not in /currencies', async () => {
    collections['/opportunities'] = [{ ...OPPORTUNITY, currencyId: { id: 99, value: 'zzz' } }]
    collections['/currencies'] = CURRENCIES
    const [deal] = await new ForceManagerAdapter().listDeals(
      creds,
      withPageSink({ page: 1, limit: 10 }),
    )
    expect(deal!.value).toBeUndefined()
  })

  it('getDeal reads GET /opportunities/{ID} and resolves its currency', async () => {
    records['/opportunities/127'] = OPPORTUNITY
    collections['/currencies'] = CURRENCIES
    const deal = await new ForceManagerAdapter().getDeal(creds, '127')
    expect(deal.id).toBe('127')
    expect(deal.value).toEqual({ amount: 34560, currency: 'EUR' })
  })
})

describe('forcemanager get by id', () => {
  it('reads the documented /{entity}/{ID} paths', async () => {
    records['/contacts/287'] = CONTACT
    records['/accounts/399'] = ACCOUNT
    records['/activities/799'] = ACTIVITY
    const a = new ForceManagerAdapter()
    expect((await a.getContact(creds, '287')).id).toBe('287')
    expect((await a.getCompany(creds, '399')).id).toBe('399')
    expect((await a.getActivity(creds, '799')).id).toBe('799')
  })
})

describe('forcemanager notes', () => {
  it('listNotes refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    await expect(
      new ForceManagerAdapter().listNotes(creds, withPageSink({ page: 1, limit: 10 })),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(seen).toHaveLength(0)
  })

  it('getNote refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    await expect(new ForceManagerAdapter().getNote(creds, '1')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(seen).toHaveLength(0)
  })
})

describe('forcemanager client details', () => {
  it('keys the pager by page size, so a walk at another limit reads the right rows', async () => {
    collections['/contacts'] = rowsOf(CONTACT, 7)
    const a = new ForceManagerAdapter()
    const walk = async (limit: number, pages: number[]) => {
      const ids: string[] = []
      for (const page of pages)
        ids.push(...(await a.listContacts(creds, withPageSink({ page, limit }))).map((r) => r.id))
      return ids
    }
    expect(await walk(3, [1, 2, 3])).toEqual(['1', '2', '3', '4', '5', '6', '7'])
    // Same connection and path, different limit: no checkpoint from the size-3 walk may be reused.
    expect(await walk(2, [1, 2, 3, 4])).toEqual(['1', '2', '3', '4', '5', '6', '7'])
    expect(await walk(3, [3])).toEqual(['7'])
  })

  it('percent-encodes the id in GET /{entity}/{ID}', async () => {
    records['/contacts/a%2Fb'] = { ...CONTACT, id: 5 }
    await new ForceManagerAdapter().getContact(creds, 'a/b')
    expect(seen.at(-1)!.url.pathname).toBe('/api/v4/contacts/a%2Fb')
  })

  it('refuses a connection without the public key before sending anything', async () => {
    await expect(
      new ForceManagerAdapter().getContact({ accessToken: '', extra: { privateKey: 'PRIV' } }, '1'),
    ).rejects.toMatchObject({ statusCode: 401 })
    expect(seen).toHaveLength(0)
  })

  it('sends the documented Accept: */* header on login and on reads', async () => {
    records['/contacts/287'] = CONTACT
    await new ForceManagerAdapter().getContact(creds, '287')
    expect(seen.map((s) => s.headers['Accept'])).toEqual(['*/*', '*/*'])
  })

  it('treats a login reply without a token as an error, sending no read', async () => {
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        calls.push(new URL(input).pathname)
        return new Response(JSON.stringify({}), { status: 200 })
      }),
    )
    await expect(new ForceManagerAdapter().getContact(creds, '287')).rejects.toMatchObject({
      statusCode: 502,
      message: expect.stringMatching(/no token/),
    })
    expect(calls).toEqual(['/api/v4/login'])
  })

  it('fails loudly when a full walk never reaches the documented []', async () => {
    let statusCalls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        const path = new URL(input).pathname.slice('/api/v4'.length)
        const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200 })
        if (path === '/login') return json(LOGIN)
        if (path === '/opportunityTypes') return json([OPPORTUNITY_TYPE])
        statusCalls++
        // An endpoint that ignores `page` would serve the same rows for ever.
        return json([OPPORTUNITY_STATUS])
      }),
    )
    await expect(
      new ForceManagerAdapter().listPipelines(creds, withPageSink({ page: 1, limit: 5 })),
    ).rejects.toMatchObject({ statusCode: 502, message: expect.stringMatching(/did not end/) })
    expect(statusCalls).toBe(1000)
  })
})

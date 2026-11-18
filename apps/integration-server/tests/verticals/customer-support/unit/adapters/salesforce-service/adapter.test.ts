/**
 * Requests and paging against the documented REST API Query resource:
 *
 * - `GET {instance_url}/services/data/vXX.X/query/?q=<SOQL>`, answering
 *   `{ done, totalSize, records, nextRecordsUrl? }`; the rest is fetched from
 *   `nextRecordsUrl`, requests that "don't include any parameters".
 *   https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/dome_query.htm
 * - `Sforce-Query-Options: batchSize=N`, 200-2,000.
 *   https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/headers_queryoptions.htm
 *
 * The fake serves `batchSize` rows per response and a `nextRecordsUrl` while
 * rows remain, and refuses anything else.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  withPageSink,
  readUpstreamPage,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { SalesforceServiceAdapter } from '../../../../../../src/verticals/customer-support/adapters/salesforce-service/index'
import { CASE, CASE_COMMENT, CONTACT, EMAIL_MESSAGE, INSTANCE_URL, QUEUE, USER } from './fixtures'

const API = `${INSTANCE_URL}/services/data/v60.0`

interface Call {
  url: string
  soql?: string
  headers: Record<string, string>
}

type Rows = Record<string, object[]>

/**
 * `rowsFor(soql)` names the rows a query returns; the fake pages them in
 * batches of the requested batchSize (default 2,000, as documented).
 */
function fakeSalesforce(rowsFor: (soql: string) => object[]) {
  const calls: Call[] = []
  const cursors: Rows = {}
  let seq = 0
  const reply = (rows: object[], at: number, size: number) => {
    const slice = rows.slice(at, at + size)
    const done = at + size >= rows.length
    let nextRecordsUrl: string | undefined
    if (!done) {
      const id = `01gD${String(++seq).padStart(11, '0')}`
      cursors[id] = rows
      nextRecordsUrl = `/services/data/v60.0/query/${id}-${at + size}`
      cursorSize[id] = size
    }
    return new Response(
      JSON.stringify({ totalSize: rows.length, done, records: slice, nextRecordsUrl }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }
  const cursorSize: Record<string, number> = {}
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    const headers = (init?.headers ?? {}) as Record<string, string>
    if (init?.method !== 'GET') throw new Error(`unexpected method ${init?.method}`)
    const u = new URL(url)
    const more = u.pathname.match(/^\/services\/data\/v60\.0\/query\/(01gD\d+)-(\d+)$/)
    if (more) {
      if (u.search !== '') throw new Error('nextRecordsUrl requests carry no parameters')
      calls.push({ url, headers })
      const [, id, at] = more
      return reply(cursors[id!]!, Number(at), cursorSize[id!]!)
    }
    if (u.origin + u.pathname !== `${API}/query/`) throw new Error(`unexpected url ${url}`)
    const soql = u.searchParams.get('q') ?? ''
    if ([...u.searchParams.keys()].join(',') !== 'q')
      throw new Error(`undocumented params ${u.search}`)
    calls.push({ url, soql, headers })
    const opt = headers['Sforce-Query-Options']
    const size = opt ? Number(opt.replace('batchSize=', '')) : 2000
    if (size < 200 || size > 2000) throw new Error(`batchSize ${size} outside 200-2000`)
    return reply(rowsFor(soql), 0, size)
  })
  return calls
}

let n = 0
/** A fresh connection per test: the row pager's memo is keyed by connection. */
function creds(): Credentials {
  n += 1
  return {
    accessToken: `access-${n}`,
    refreshToken: `refresh-${n}`,
    extra: { instanceUrl: INSTANCE_URL, environment: 'production' },
  }
}

function sfId(prefix: string, i: number): string {
  return `${prefix}${String(i).padStart(15 - prefix.length, '0')}AAA`
}

afterEach(() => vi.restoreAllMocks())

const adapter = new SalesforceServiceAdapter({
  clientId: 'k',
  clientSecret: 's',
  redirectUri: 'https://x.example/cb',
})

type Lister = (params: QueryParams) => Promise<Array<{ id: string }>>

async function walk(list: Lister, limit: number) {
  const ids: string[] = []
  const hasMore: Array<boolean | undefined> = []
  for (let page = 1; page <= 20; page++) {
    const params = withPageSink({ page, limit } as QueryParams)
    const rows = await list(params)
    expect(rows.length).toBeLessThanOrEqual(limit)
    ids.push(...rows.map((r) => r.id))
    const meta = readUpstreamPage(params)
    hasMore.push(meta?.hasMore)
    if (!meta?.hasMore) break
  }
  return { ids, hasMore }
}

describe('salesforce-service client', () => {
  it('queries the instance_url with the Bearer token and a batchSize header', async () => {
    const calls = fakeSalesforce(() => [CASE])
    const c = creds()
    await adapter.listTickets(c, withPageSink({ page: 1, limit: 25 } as QueryParams))
    expect(calls).toHaveLength(1)
    expect(calls[0]!.headers['Authorization']).toBe(`Bearer ${c.accessToken}`)
    expect(calls[0]!.headers['Sforce-Query-Options']).toBe('batchSize=200')
    expect(calls[0]!.soql).toBe(
      'SELECT Id,CaseNumber,Subject,Status,IsClosed,ClosedDate,Priority,Origin,ContactId,' +
        'AccountId,OwnerId,Owner.Type,ParentId,CreatedDate,LastModifiedDate FROM Case ORDER BY Id',
    )
  })

  it('a connection with no instanceUrl fails before any request', async () => {
    const calls = fakeSalesforce(() => [])
    await expect(
      adapter.listTickets(
        { accessToken: 'a', extra: {} },
        withPageSink({ page: 1 } as QueryParams),
      ),
    ).rejects.toMatchObject({ statusCode: 401 })
    expect(calls).toHaveLength(0)
  })
})

describe('salesforce-service paging (nextRecordsUrl + row pager)', () => {
  it('walks 2 batches + a remainder at limit 100: every row once, exact hasMore', async () => {
    const N = 450
    const rows = Array.from({ length: N }, (_, i) => ({ ...CASE, Id: sfId('500', i) }))
    const calls = fakeSalesforce(() => rows)
    const c = creds()
    const { ids, hasMore } = await walk((p) => adapter.listTickets(c, p), 100)
    expect(ids).toEqual(rows.map((r) => r.Id))
    expect(hasMore).toEqual([true, true, true, true, false])
    // One query plus one request per further batch of 200: 3 in all.
    expect(calls).toHaveLength(3)
    expect(calls.filter((x) => x.soql !== undefined)).toHaveLength(1)
  })

  it('a limit above 2,000 is served from 2,000-row batches', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ ...CONTACT, Id: sfId('003', i) }))
    const calls = fakeSalesforce(() => rows)
    const params = withPageSink({ page: 1, limit: 5000 } as QueryParams)
    const out = await adapter.listContacts(creds(), params)
    expect(out).toHaveLength(5)
    expect(calls[0]!.headers['Sforce-Query-Options']).toBe('batchSize=2000')
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })
})

describe('salesforce-service updated_after', () => {
  it('adds LastModifiedDate >= <second> to the SOQL WHERE clause', async () => {
    const calls = fakeSalesforce(() => [])
    await adapter.listTickets(
      creds(),
      withPageSink({
        page: 1,
        updatedAfter: new Date('2026-01-02T03:04:05.678Z'),
      } as QueryParams),
    )
    expect(calls[0]!.soql).toMatch(
      / FROM Case WHERE LastModifiedDate >= 2026-01-02T03:04:05Z ORDER BY Id$/,
    )
  })

  it('combines with a list filter', async () => {
    const calls = fakeSalesforce(() => [])
    await adapter.listUsers(
      creds(),
      withPageSink({ page: 1, updatedAfter: new Date('2026-01-02T00:00:00Z') } as QueryParams),
    )
    expect(calls[0]!.soql).toMatch(
      / FROM User WHERE UserType = 'Standard' AND LastModifiedDate >= 2026-01-02T00:00:00Z ORDER BY Id$/,
    )
  })
})

describe('salesforce-service resources', () => {
  it('getTicket queries the case by Id and maps Owner.Type', async () => {
    const calls = fakeSalesforce(() => [CASE])
    const t = await adapter.getTicket(creds(), CASE.Id)
    expect(calls[0]!.soql).toMatch(/ FROM Case WHERE Id = '500D000000IRFmaIAH'$/)
    expect(t.assigneeId).toBe('005D0000005Bk90IAC')
  })

  it('getTicket answers 404 when no row comes back', async () => {
    fakeSalesforce(() => [])
    await expect(adapter.getTicket(creds(), '500D000000IRFmzIAH')).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('an id that is not a Salesforce id is 404 before any request (no SOQL injection)', async () => {
    const calls = fakeSalesforce(() => [])
    for (const bad of ["x' OR Name != '", '123', '500D000000IRFmaIAH%27']) {
      await expect(adapter.getTicket(creds(), bad)).rejects.toMatchObject({ statusCode: 404 })
      await expect(
        adapter.listMessages(creds(), bad, withPageSink({ page: 1 } as QueryParams)),
      ).rejects.toMatchObject({ statusCode: 404 })
    }
    expect(calls).toHaveLength(0)
  })

  it('listMessages streams the case comments, then its emails', async () => {
    const comments = Array.from({ length: 3 }, (_, i) => ({ ...CASE_COMMENT, Id: sfId('00a', i) }))
    const emails = Array.from({ length: 2 }, (_, i) => ({ ...EMAIL_MESSAGE, Id: sfId('02s', i) }))
    const calls = fakeSalesforce((soql) => {
      if (soql.includes(' FROM CaseComment ')) return comments
      if (soql.includes(' FROM EmailMessage ')) return emails
      throw new Error(soql)
    })
    const c = creds()
    const { ids, hasMore } = await walk((p) => adapter.listMessages(c, CASE.Id, p), 2)
    expect(ids).toEqual([...comments, ...emails].map((r) => r.Id))
    expect(hasMore).toEqual([true, true, false])
    expect(calls.map((x) => x.soql)).toEqual([
      "SELECT Id,ParentId,CommentBody,IsPublished,CreatedById,CreatedDate,LastModifiedDate FROM CaseComment WHERE ParentId = '500D000000IRFmaIAH' ORDER BY Id",
      "SELECT Id,ParentId,Subject,TextBody,FromAddress,FromId,Incoming,HasAttachment,Status,MessageDate,CreatedById,CreatedDate,LastModifiedDate FROM EmailMessage WHERE ParentId = '500D000000IRFmaIAH' ORDER BY Id",
    ])
  })

  it('getMessage tries CaseComment, then EmailMessage', async () => {
    const calls = fakeSalesforce((soql) =>
      soql.includes(' FROM EmailMessage ') ? [EMAIL_MESSAGE] : [],
    )
    const m = await adapter.getMessage(creds(), EMAIL_MESSAGE.Id)
    expect(m.id).toBe(EMAIL_MESSAGE.Id)
    expect(m.authorType).toBe('contact')
    expect(calls.map((x) => x.soql?.split(' WHERE ')[1])).toEqual([
      "Id = '02sD000000abcdeIAA'",
      "Id = '02sD000000abcdeIAA'",
    ])
  })

  it('listContacts reads Contact', async () => {
    const calls = fakeSalesforce(() => [CONTACT])
    const out = await adapter.listContacts(creds(), withPageSink({ page: 1 } as QueryParams))
    expect(out.map((c) => c.email)).toEqual(['jane.doe@acme.example'])
    expect(calls[0]!.soql).toBe(
      'SELECT Id,Name,Email,Phone,AccountId,CreatedDate,LastModifiedDate FROM Contact ORDER BY Id',
    )
  })

  it('getUser is limited to Standard users', async () => {
    const calls = fakeSalesforce(() => [USER])
    await adapter.getUser(creds(), USER.Id)
    expect(calls[0]!.soql).toMatch(
      / FROM User WHERE Id = '005D0000005Bk90IAC' AND UserType = 'Standard'$/,
    )
  })

  it('listTeams and getTeam read queues only', async () => {
    const calls = fakeSalesforce(() => [QUEUE])
    const c = creds()
    const teams = await adapter.listTeams(c, withPageSink({ page: 1 } as QueryParams))
    await adapter.getTeam(c, QUEUE.Id)
    expect(teams.map((t) => t.name)).toEqual(['Tier 1 Support'])
    expect(calls[0]!.soql).toMatch(/ FROM Group WHERE Type = 'Queue' ORDER BY Id$/)
    expect(calls[1]!.soql).toMatch(
      / FROM Group WHERE Id = '00GD0000001aBcDMAU' AND Type = 'Queue'$/,
    )
  })

  it('tags and macros refuse with 501 NOT_SUPPORTED before any request', async () => {
    const calls = fakeSalesforce(() => [])
    const c = creds()
    for (const call of [
      () => adapter.listTags(c, {}),
      () => adapter.getTag(c, 'x'),
      () => adapter.listMacros(c, {}),
      () => adapter.getMacro(c, 'x'),
    ]) {
      await expect(call()).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    }
    expect(calls).toHaveLength(0)
  })
})

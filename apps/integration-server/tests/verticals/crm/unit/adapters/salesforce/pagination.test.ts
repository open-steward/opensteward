/**
 * All 5 SOQL lists ignored `page`: `pageParams` read `params.offset`, which
 * nothing upstream of it ever set, so OFFSET stayed 0 and every page repeated
 * page 1 — a sync of 500+ rows re-fetched page 1 until the 10,000-page guard
 * threw. OFFSET is not merely unused now, it is gone: past 2,000 rows it
 * fails outright with NUMBER_OUTSIDE_VALID_RANGE, which is why the fix walks
 * `nextRecordsUrl` instead. A batch is at least 200 rows, so the shared row
 * pager cuts the caller's pages out of the batches (see `listSoqlRows` in
 * index.ts).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  withPageSink,
  readUpstreamPage,
  _resetCursorPager,
  parseListQuery,
  listPage,
} from '@opensteward/shared'
import { SalesforceAdapter } from '../../../../../../src/verticals/crm/adapters/salesforce/index'
import {
  MIN_QUERY_BATCH_SIZE,
  MAX_QUERY_BATCH_SIZE,
} from '../../../../../../src/verticals/crm/adapters/salesforce/constants'
import type { Credentials } from '../../../../../../src/verticals/crm/adapter/interface'

const CREDS = {
  accessToken: 'tok',
  extra: { instanceUrl: 'https://na1.salesforce.com' },
} as unknown as Credentials

interface Call {
  kind: 'query' | 'queryNext'
  soql?: string
  batchSize?: number
  cursor?: string
}

/**
 * Stands in for Salesforce's own batching: `query` establishes a batch size
 * (mirroring the `Sforce-Query-Options` header), and `queryNext` continues
 * the SAME chain at whatever size that first request set — a fresh `query`
 * call, not `queryNext`, is what OFFSET-based paging used to require.
 */
function fakeSoqlSource(total: number, calls: Call[] = []) {
  let established = total
  const page = (start: number) => {
    const items = Array.from(
      { length: Math.max(0, Math.min(established, total - start)) },
      (_, i) => ({ Id: String(start + i) }),
    )
    const end = start + items.length
    const done = end >= total
    return {
      totalSize: total,
      done,
      nextRecordsUrl: done ? undefined : `/services/data/v60.0/query/01g-${end}`,
      records: items,
    }
  }
  const query = vi.fn(async (soql: string, batchSize?: number) => {
    calls.push({ kind: 'query', soql, batchSize })
    established = batchSize ?? total
    return page(0)
  })
  const queryNext = vi.fn(async (cursor: string) => {
    calls.push({ kind: 'queryNext', cursor })
    return page(Number(cursor.split('-').pop()))
  })
  return { query, queryNext, calls }
}

function adapterWith(client: { query: unknown; queryNext: unknown }) {
  const adapter = new SalesforceAdapter()
  vi.spyOn(adapter as unknown as { client: (c: Credentials) => unknown }, 'client').mockReturnValue(client)
  return adapter
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe('`page` actually advances', () => {
  it('returns DIFFERENT records for page 2 than page 1', async () => {
    const source = fakeSoqlSource(250)
    const adapter = adapterWith(source)
    const p1 = await adapter.listContacts(CREDS, { page: 1, limit: 200 })
    const p2 = await adapter.listContacts(CREDS, { page: 2, limit: 200 })
    expect(p1).toHaveLength(200)
    expect(p2).toHaveLength(50)
    expect(p1[0]?.id).toBe('0')
    expect(p2[0]?.id).toBe('200')
    expect(new Set([...p1, ...p2].map((c) => c.id)).size).toBe(250)
  })

  it('walks the SECOND page through queryNext, not a fresh OFFSET query', async () => {
    const calls: Call[] = []
    const source = fakeSoqlSource(250, calls)
    const adapter = adapterWith(source)
    await adapter.listContacts(CREDS, { page: 1, limit: 200 })
    await adapter.listContacts(CREDS, { page: 2, limit: 200 })
    expect(calls.map((c) => c.kind)).toEqual(['query', 'queryNext'])
    expect(calls[1]?.cursor).toBe('/services/data/v60.0/query/01g-200')
  })

  it('does not re-walk from page 1 on sequential access: one request per batch', async () => {
    // 650 rows in batches of 200 are four batches. A page that ends exactly on
    // a batch boundary peeks at the next batch to know whether more remains,
    // and the next page is served from that peeked batch — so a whole walk
    // costs four requests, never a re-walk from the first batch.
    const calls: Call[] = []
    const source = fakeSoqlSource(650, calls)
    const adapter = adapterWith(source)
    let page = 1
    for (; ; page++) {
      const params = withPageSink({ page, limit: 200 })
      await adapter.listContacts(CREDS, params)
      if (!readUpstreamPage(params)?.hasMore) break
    }
    expect(page).toBe(4)
    expect(calls.map((c) => c.kind)).toEqual(['query', 'queryNext', 'queryNext', 'queryNext'])
  })
})

describe("caller pages are cut from SOQL batches, whatever the caller's limit", () => {
  // Salesforce answers in batches of at least 200 rows. At `limit=25` each
  // page used to BE one batch: the router kept 25 of its 200 rows and page 2
  // started at row 200, so 175 of every 200 were never served.
  async function walk(
    list: (params: ReturnType<typeof parseListQuery>) => Promise<Array<{ id: string }>>,
    limit: number,
  ) {
    const served: string[] = []
    const sizes: number[] = []
    for (let page = 1; page < 1000; page++) {
      const params = parseListQuery({ limit: String(limit), page: String(page) })
      const env = listPage(await list(params), params, 'salesforce')
      served.push(...env.data.map((r) => r.id))
      sizes.push(env.data.length)
      if (env.meta.hasMore !== true) break
    }
    return { served, sizes }
  }

  it('a walk at limit 25 over 450 records serves all 450, once each, with 3 requests', async () => {
    const calls: Call[] = []
    const adapter = adapterWith(fakeSoqlSource(450, calls))
    const { served, sizes } = await walk((p) => adapter.listContacts(CREDS, p), 25)
    expect(served).toEqual(Array.from({ length: 450 }, (_, i) => String(i)))
    expect(sizes).toEqual(Array.from({ length: 18 }, () => 25))
    expect(calls.map((c) => c.kind)).toEqual(['query', 'queryNext', 'queryNext'])
    expect(calls[0]?.batchSize).toBe(MIN_QUERY_BATCH_SIZE)
  })

  it('a page past the end of an exact multiple is empty and asks nothing', async () => {
    const calls: Call[] = []
    const adapter = adapterWith(fakeSoqlSource(400, calls))
    const { served } = await walk((p) => adapter.listDeals(CREDS, p), 25)
    expect(served).toHaveLength(400)
    const before = calls.length
    const params = parseListQuery({ limit: '25', page: '17' })
    expect(await adapter.listDeals(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(calls).toHaveLength(before)
  })

  it('walks at different limits share one batch walk: the key is the batch size, not the limit', async () => {
    const calls: Call[] = []
    const adapter = adapterWith(fakeSoqlSource(450, calls))
    const at25 = await adapter.listNotes(CREDS, { page: 9, limit: 25 })
    const at50 = await adapter.listNotes(CREDS, { page: 5, limit: 50 })
    expect(at25.map((n) => n.id)).toEqual(Array.from({ length: 25 }, (_, i) => String(200 + i)))
    expect(at50.map((n) => n.id)).toEqual(Array.from({ length: 50 }, (_, i) => String(200 + i)))
    // Both land in the second batch; the second call starts from its mark.
    expect(calls.map((c) => c.kind)).toEqual(['query', 'queryNext', 'queryNext'])
  })
})

describe('what a walk is keyed by', () => {
  // The row pager keeps the rows of the last batch it fetched and serves the
  // next page from them without a request. Whatever that key leaves out
  // shares those rows.

  /** `total` records whose ids start with `tag`, as `fakeSoqlSource` serves them. */
  function tagged(tag: string, total: number, calls: Call[]) {
    const inner = fakeSoqlSource(total, calls)
    const retag = <R extends { records: Array<{ Id: string }> }>(res: R): R => ({
      ...res,
      records: res.records.map((r) => ({ ...r, Id: `${tag}${r.Id}` })),
    })
    return {
      query: vi.fn(async (soql: string, batchSize?: number) => retag(await inner.query(soql, batchSize))),
      queryNext: vi.fn(async (cursor: string) => retag(await inner.queryNext(cursor))),
    }
  }

  /** An adapter whose client answers with a different source per access token. */
  function adapterPerToken(sources: Record<string, { query: unknown; queryNext: unknown }>) {
    const adapter = new SalesforceAdapter()
    vi.spyOn(adapter as unknown as { client: (c: Credentials) => unknown }, 'client').mockImplementation(
      (c: Credentials) => sources[c.accessToken],
    )
    return adapter
  }

  it('two users of one org never share a walk: each page is fetched with its own token', async () => {
    // Record visibility is per user. User A sees 400 contacts, user B 30.
    const callsA: Call[] = []
    const callsB: Call[] = []
    const adapter = adapterPerToken({
      'tok-a': tagged('A', 400, callsA),
      'tok-b': tagged('B', 30, callsB),
    })
    const org = { instanceUrl: 'https://acme.my.salesforce.com' }
    const userA = { accessToken: 'tok-a', refreshToken: 'rt-a', extra: org } as unknown as Credentials
    const userB = { accessToken: 'tok-b', refreshToken: 'rt-b', extra: org } as unknown as Credentials
    await adapter.listContacts(userA, { page: 1, limit: 25 })
    const b2 = await adapter.listContacts(userB, { page: 2, limit: 25 })
    expect(b2.map((c) => c.id)).toEqual(Array.from({ length: 5 }, (_, i) => `B${25 + i}`))
    expect(callsB.map((c) => c.kind)).toEqual(['query'])
  })

  it('one user across an access-token refresh keeps the walk', async () => {
    const calls: Call[] = []
    const source = tagged('A', 400, calls)
    const adapter = adapterPerToken({ 'tok-1': source, 'tok-2': source })
    const org = { instanceUrl: 'https://acme.my.salesforce.com' }
    const before = { accessToken: 'tok-1', refreshToken: 'rt', extra: org } as unknown as Credentials
    const after = { accessToken: 'tok-2', refreshToken: 'rt', extra: org } as unknown as Credentials
    await adapter.listContacts(before, { page: 1, limit: 25 })
    await adapter.listContacts(after, { page: 2, limit: 25 })
    expect(calls.map((c) => c.kind)).toEqual(['query'])
  })

  it('two orgs never share a walk', async () => {
    const calls: Call[] = []
    const adapter = adapterWith(fakeSoqlSource(400, calls))
    const other = {
      accessToken: 'tok',
      extra: { instanceUrl: 'https://other.my.salesforce.com' },
    } as unknown as Credentials
    await adapter.listContacts(CREDS, { page: 1, limit: 25 })
    await adapter.listContacts(other, { page: 2, limit: 25 })
    expect(calls.map((c) => c.kind)).toEqual(['query', 'query'])
  })

  it('two sObjects never share a walk', async () => {
    const calls: Call[] = []
    const adapter = adapterWith(fakeSoqlSource(400, calls))
    await adapter.listContacts(CREDS, { page: 1, limit: 25 })
    await adapter.listDeals(CREDS, { page: 2, limit: 25 })
    expect(calls.map((c) => c.soql?.split(' FROM ')[1])).toEqual([
      'Contact ORDER BY Id',
      'Opportunity ORDER BY Id',
    ])
  })

  it("a direct call with no limit gets Salesforce's historic 25, not the router's 100", async () => {
    const adapter = adapterWith(fakeSoqlSource(400))
    expect(await adapter.listContacts(CREDS, {})).toHaveLength(25)
  })
})

describe('a query locator Salesforce refuses', () => {
  /**
   * `fakeSoqlSource`, except that each `nextRecordsUrl` can be read once:
   * a second read is refused with INVALID_QUERY_LOCATOR, the most a strict
   * reading of the REST guide would allow.
   */
  function readOnce(total: number, calls: Call[]) {
    const inner = fakeSoqlSource(total, calls)
    const read = new Set<string>()
    let generation = 0
    const tag = <R extends { nextRecordsUrl?: string }>(res: R, gen: number): R =>
      res.nextRecordsUrl ? { ...res, nextRecordsUrl: `${res.nextRecordsUrl}@${gen}` } : res
    return {
      query: vi.fn(async (soql: string, batchSize?: number) => {
        generation++
        return tag(await inner.query(soql, batchSize), generation)
      }),
      queryNext: vi.fn(async (cursor: string) => {
        const [url, gen] = cursor.split('@')
        if (read.has(cursor) || Number(gen) !== generation) {
          calls.push({ kind: 'queryNext', cursor })
          throw new Error(
            'Salesforce API error 400: [{"message":"invalid query locator","errorCode":"INVALID_QUERY_LOCATOR"}]',
          )
        }
        read.add(cursor)
        return tag(await inner.queryNext(url!), Number(gen))
      }),
    }
  }

  it('restarts the walk from a fresh query instead of failing the page', async () => {
    const calls: Call[] = []
    const adapter = adapterWith(readOnce(450, calls))
    const at25 = await adapter.listNotes(CREDS, { page: 9, limit: 25 })
    expect(at25.map((n) => n.id)).toEqual(Array.from({ length: 25 }, (_, i) => String(200 + i)))
    // Page 5 at 50 starts from the batch page 9 already read: refused, so walked again.
    const at50 = await adapter.listNotes(CREDS, { page: 5, limit: 50 })
    expect(at50.map((n) => n.id)).toEqual(Array.from({ length: 50 }, (_, i) => String(200 + i)))
    expect(calls.map((c) => c.kind)).toEqual(['query', 'queryNext', 'queryNext', 'query', 'queryNext'])
  })

  it('a sequential walk reads each locator once', async () => {
    const calls: Call[] = []
    const adapter = adapterWith(readOnce(450, calls))
    const served: string[] = []
    for (let page = 1; ; page++) {
      const params = withPageSink({ page, limit: 25 })
      served.push(...(await adapter.listContacts(CREDS, params)).map((c) => c.id))
      if (!readUpstreamPage(params)?.hasMore) break
    }
    expect(served).toEqual(Array.from({ length: 450 }, (_, i) => String(i)))
    expect(calls.map((c) => c.kind)).toEqual(['query', 'queryNext', 'queryNext'])
  })

  it('another error still fails the page', async () => {
    const client = {
      query: vi.fn(async () => ({
        totalSize: 400,
        done: false,
        nextRecordsUrl: '/services/data/v60.0/query/01g-200',
        records: Array.from({ length: 200 }, (_, i) => ({ Id: String(i) })),
      })),
      queryNext: vi.fn(async () => {
        throw new Error('Salesforce API error 503: Service Unavailable')
      }),
    }
    const adapter = adapterWith(client)
    await expect(adapter.listContacts(CREDS, { page: 9, limit: 25 })).rejects.toThrow('503')
    expect(client.query).toHaveBeenCalledTimes(1)
  })
})

describe('listPipelines is the whole collection on page 1', () => {
  it('reports its total, and page 2 is empty', async () => {
    const describeObject = vi.fn(async () => ({
      fields: [
        {
          name: 'StageName',
          picklistValues: [{ value: 'Prospecting', label: 'Prospecting', active: true }],
        },
      ],
    }))
    const client = { describe: describeObject, query: undefined, queryNext: undefined }
    const adapter = adapterWith(client)
    const p1 = withPageSink({ page: 1, limit: 10 })
    expect(await adapter.listPipelines(CREDS, p1)).toHaveLength(1)
    expect(readUpstreamPage(p1)).toMatchObject({ totalCount: 1, hasMore: false })
    const p2 = withPageSink({ page: 2, limit: 10 })
    expect(await adapter.listPipelines(CREDS, p2)).toEqual([])
    expect(await adapter.getPipeline(CREDS, 'default')).toBeDefined()
  })
})

describe('OFFSET is gone', () => {
  it('never sends OFFSET in the SOQL, even walking to page 3', async () => {
    const calls: Call[] = []
    const source = fakeSoqlSource(650, calls)
    const adapter = adapterWith(source)
    await adapter.listContacts(CREDS, { page: 3, limit: 200 })
    for (const call of calls) {
      if (call.soql) expect(call.soql.toUpperCase()).not.toContain('OFFSET')
    }
  })

  it('orders by Id, so the walk is deterministic', async () => {
    const source = fakeSoqlSource(10)
    const adapter = adapterWith(source)
    await adapter.listContacts(CREDS, { page: 1, limit: 200 })
    expect(source.calls[0]?.soql).toMatch(/ORDER BY Id/)
  })

  it('applies to every SOQL list: companies, deals and notes too', async () => {
    for (const [call, args] of [
      ['listCompanies', ['listCompanies']],
      ['listDeals', ['listDeals']],
      ['listNotes', ['listNotes']],
    ] as const) {
      const source = fakeSoqlSource(250)
      const adapter = adapterWith(source)
      const method = (adapter as unknown as Record<string, (c: Credentials, p: unknown) => Promise<unknown>>)[call]
      const p1 = (await method.call(adapter, CREDS, { page: 1, limit: 200 })) as Array<{ id: string }>
      const p2 = (await method.call(adapter, CREDS, { page: 2, limit: 200 })) as Array<{ id: string }>
      expect(p1[0]?.id, `${args[0]} page 1`).toBe('0')
      expect(p2[0]?.id, `${args[0]} page 2`).toBe('200')
    }
  })
})

describe('the batch size header stays in Salesforce\'s valid range', () => {
  it('clamps a small requested limit up to the 200 floor', async () => {
    const source = fakeSoqlSource(10)
    const adapter = adapterWith(source)
    await adapter.listContacts(CREDS, { page: 1, limit: 25 })
    expect(source.calls[0]?.batchSize).toBe(MIN_QUERY_BATCH_SIZE)
  })

  it('clamps a large requested limit down to the 2000 ceiling', async () => {
    const source = fakeSoqlSource(10)
    const adapter = adapterWith(source)
    await adapter.listContacts(CREDS, { page: 1, limit: 5000 })
    expect(source.calls[0]?.batchSize).toBe(MAX_QUERY_BATCH_SIZE)
  })

  it('leaves a limit already inside the valid range alone', async () => {
    const source = fakeSoqlSource(10)
    const adapter = adapterWith(source)
    await adapter.listContacts(CREDS, { page: 1, limit: 500 })
    expect(source.calls[0]?.batchSize).toBe(500)
  })
})

describe('hasMore is reported from the response\'s done flag', () => {
  it('true on every page but the last', async () => {
    const source = fakeSoqlSource(250)
    const adapter = adapterWith(source)
    const seen: Array<boolean | undefined> = []
    for (let page = 1; page <= 2; page++) {
      const params = withPageSink({ page, limit: 200 })
      await adapter.listContacts(CREDS, params)
      seen.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual([true, false])
  })

  it('false on an exact-multiple final page — done, not a length guess, ends it', async () => {
    const source = fakeSoqlSource(200)
    const adapter = adapterWith(source)
    const params = withPageSink({ page: 1, limit: 200 })
    const items = await adapter.listContacts(CREDS, params)
    expect(items).toHaveLength(200)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })
})

describe('a page past the end', () => {
  it('answers empty rather than looping', async () => {
    const source = fakeSoqlSource(150)
    const adapter = adapterWith(source)
    const items = await adapter.listContacts(CREDS, { page: 9, limit: 200 })
    expect(items).toEqual([])
  })
})

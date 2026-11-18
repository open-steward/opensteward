/**
 * Zuora list paging and request shape, against a fake that honours ONLY the
 * documented Object Query parameters.
 *
 * https://developer.zuora.com/v1-api-reference/api/object-queries/queryaccounts.md
 * (and querypayments.md, queryrefunds.md — the same parameters):
 *   pageSize:  "If the specified pageSize is less than 1 or greater than 99,
 *               Zuora will return a 400 error."
 *   cursor:    "A cursor for use in pagination. A cursor defines the starting
 *               place in a list."
 *   nextPage:  "A string that can be used as the cursor value to retrieve the
 *               next page of the response if it exists; otherwise absent."
 *   expand[] / filter[]: per-operation enums; operator syntax from
 *   https://developer.zuora.com/docs/guides/expand-filter-fields-sort.md
 *   (`currency.EQ:CAD`, `updateddate.LT:2024-01-01T00:00:00Z`).
 * Token: https://developer.zuora.com/v1-api-reference/api/oauth/createtoken.md
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import {
  _resetCursorPager,
  readUpstreamPage,
  withPageSink,
  type Credentials,
} from '@opensteward/shared'
import { ZuoraAdapter } from '../../../../../../src/verticals/payments/adapters/zuora/index'

const MAX = 99
const CREDS: Credentials = {
  accessToken: 'tok_a',
  extra: { clientId: 'cid', clientSecret: 'secret', baseUrl: 'https://rest.eu.zuora.com' },
}

type Method = 'listCustomers' | 'listCharges' | 'listRefunds'
type Resource = 'accounts' | 'payments' | 'refunds'

const CASES: Array<{ method: Method; resource: Resource }> = [
  { method: 'listCustomers', resource: 'accounts' },
  { method: 'listCharges', resource: 'payments' },
  { method: 'listRefunds', resource: 'refunds' },
]

interface Row {
  id: string
  sourceType?: string
  [k: string]: unknown
}

interface Sent {
  baseURL?: string
  path: string
  query: Array<[string, string]>
}

function row(resource: Resource, i: number, sourceType = 'Payment'): Row {
  const id = `${resource.slice(0, 3)}_${String(i).padStart(4, '0')}`
  if (resource === 'accounts') return { id, name: `Acct ${i}`, currency: 'USD', balance: 1 }
  if (resource === 'payments') return { id, amount: 10.5, currency: 'USD', status: 'Processed' }
  return {
    id,
    amount: 2.25,
    currency: 'EUR',
    status: 'Processed',
    sourceType,
    refundApplications: [{ paymentId: `pay_for_${id}` }],
  }
}

function dataset(resource: Resource, n: number): Row[] {
  const rows: Row[] = []
  for (let i = 1; i <= n; i++) {
    rows.push(row(resource, i))
    // Credit-memo refunds interleaved: `filter[]=sourcetype.EQ:Payment` must drop them.
    if (resource === 'refunds' && i % 2 === 1) rows.push(row(resource, 1000 + i, 'CreditMemo'))
  }
  return rows
}

/** A fake Zuora Object Query host. */
function fakeZuora(data: Partial<Record<Resource, Row[]>>) {
  const sent: Sent[] = []
  const minted = new Map<string, number>()
  const issued: string[] = []
  let baseURL: string | undefined
  const get = vi.fn(async (path: string, config?: { params?: URLSearchParams }) => {
    const query = config?.params ? [...config.params.entries()] : []
    sent.push({ baseURL, path, query })
    const allowed = new Set(['pageSize', 'cursor', 'expand[]', 'filter[]', 'sort[]', 'fields[]'])
    for (const [k] of query) {
      if (!allowed.has(k))
        throw Object.assign(new Error(`400 unknown ${k}`), { response: { status: 400 } })
    }
    const m = /^\/object-query\/(accounts|payments|refunds)(?:\/([^/]+))?$/.exec(path)
    if (!m) throw Object.assign(new Error(`404 ${path}`), { response: { status: 404 } })
    let rows = data[m[1] as Resource] ?? []
    if (m[2]) {
      const hit = rows.find((r) => r.id === decodeURIComponent(m[2]!))
      if (!hit) throw Object.assign(new Error('404'), { response: { status: 404 } })
      return { data: hit }
    }
    for (const [k, v] of query) {
      if (k !== 'filter[]') continue
      const [field, rest] = v.split(/\.(EQ|GE):/).filter((_, i) => i !== 1) as [string, string]
      if (field === 'sourcetype') rows = rows.filter((r) => r.sourceType === rest)
      else if (field !== 'updateddate') throw new Error(`400 filter ${v}`)
    }
    const sizeRaw = query.find(([k]) => k === 'pageSize')?.[1]
    const size = sizeRaw === undefined ? 10 : Number(sizeRaw)
    if (!Number.isInteger(size) || size < 1 || size > MAX) {
      throw Object.assign(new Error(`400 pageSize ${sizeRaw}`), { response: { status: 400 } })
    }
    let start = 0
    const cursor = query.find(([k]) => k === 'cursor')?.[1]
    if (cursor !== undefined) {
      const at = minted.get(cursor)
      if (at === undefined)
        throw Object.assign(new Error('400 cursor'), { response: { status: 400 } })
      start = at
    }
    const slice = rows.slice(start, start + size)
    const body: Record<string, unknown> = { data: slice }
    const end = start + slice.length
    if (end < rows.length) {
      const token = Buffer.from(`${end}:${rows[end - 1]!.id}`).toString('base64')
      minted.set(token, end)
      issued.push(token)
      body.nextPage = token
    }
    return { data: body }
  })
  vi.spyOn(axios, 'create').mockImplementation(((cfg: { baseURL?: string }) => {
    baseURL = cfg.baseURL
    return { get }
  }) as never)
  return { sent, issued, get }
}

async function callPage(method: Method, page: number, limit: number, creds = CREDS) {
  const params = withPageSink({ page, limit })
  const items = (await new ZuoraAdapter()[method](creds, params)) as Array<{ id: string }>
  return { ids: items.map((i) => i.id), hasMore: readUpstreamPage(params)?.hasMore, params }
}

function expectedIds(rows: Row[], resource: Resource): string[] {
  return rows.filter((r) => resource !== 'refunds' || r.sourceType === 'Payment').map((r) => r.id)
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe.each(CASES)('Zuora $method paging', ({ method, resource }) => {
  it('serves 2L+1 rows over three pages, each id once, with exact hasMore', async () => {
    const L = 3
    const rows = dataset(resource, 2 * L + 1)
    fakeZuora({ [resource]: rows })
    const p1 = await callPage(method, 1, L)
    const p2 = await callPage(method, 2, L)
    const p3 = await callPage(method, 3, L)
    expect([p1.hasMore, p2.hasMore, p3.hasMore]).toEqual([true, true, false])
    expect([...p1.ids, ...p2.ids, ...p3.ids]).toEqual(expectedIds(rows, resource))
    const p4 = await callPage(method, 4, L)
    expect(p4.ids).toEqual([])
    expect(p4.hasMore).toBe(false)
  })

  it('sends page 2 as cursor=<nextPage of page 1> at the caller page size, on the documented path', async () => {
    const { sent, issued } = fakeZuora({ [resource]: dataset(resource, 10) })
    await callPage(method, 1, 4)
    expect(sent[0]!.path).toBe(`/object-query/${resource}`)
    expect(sent[0]!.query.find(([k]) => k === 'cursor')).toBeUndefined()
    const next = issued[issued.length - 1]
    sent.length = 0
    await callPage(method, 2, 4)
    expect(sent).toHaveLength(1)
    expect(sent[0]!.query).toEqual(
      expect.arrayContaining([
        ['pageSize', '4'],
        ['cursor', next],
      ]),
    )
  })

  it('walks the cursor chain for a page asked for out of order', async () => {
    const rows = dataset(resource, 9)
    fakeZuora({ [resource]: rows })
    const p3 = await callPage(method, 3, 3)
    expect(p3.ids).toEqual(expectedIds(rows, resource).slice(6, 9))
    expect(p3.hasMore).toBe(false)
  })

  it('clamps a limit above 99, reports the size sent, and still serves every row', async () => {
    const rows = dataset(resource, 2 * MAX + 1)
    const { sent } = fakeZuora({ [resource]: rows })
    const pages = []
    for (let k = 1; k <= 4; k++) pages.push(await callPage(method, k, 500))
    expect(sent.every((s) => s.query.some(([k, v]) => k === 'pageSize' && v === String(MAX)))).toBe(
      true,
    )
    expect(pages.flatMap((p) => p.ids)).toEqual(expectedIds(rows, resource))
    expect(pages.map((p) => p.hasMore)).toEqual([true, true, false, false])
    expect(readUpstreamPage(pages[0]!.params)?.pageSize).toBe(MAX)
  })

  it('sends updatedAfter as filter[]=updateddate.GE:<ISO>', async () => {
    const { sent } = fakeZuora({ [resource]: dataset(resource, 2) })
    const params = withPageSink({
      page: 1,
      limit: 5,
      updatedAfter: new Date('2024-01-01T00:00:00.000Z'),
    })
    await new ZuoraAdapter()[method](CREDS, params)
    expect(sent[0]!.query).toContainEqual(['filter[]', 'updateddate.GE:2024-01-01T00:00:00Z'])
  })

  it("uses the connection's environment host", async () => {
    const { sent } = fakeZuora({ [resource]: dataset(resource, 1) })
    await callPage(method, 1, 5)
    expect(sent[0]!.baseURL).toBe('https://rest.eu.zuora.com')
  })
})

describe('Zuora request shape', () => {
  it('expands the bill-to contact on accounts', async () => {
    const { sent } = fakeZuora({ accounts: dataset('accounts', 1) })
    await callPage('listCustomers', 1, 5)
    expect(sent[0]!.query).toContainEqual(['expand[]', 'billto'])
  })

  it('lists only refunds of payments, with their applications expanded', async () => {
    const { sent } = fakeZuora({ refunds: dataset('refunds', 1) })
    await callPage('listRefunds', 1, 5)
    expect(sent[0]!.query).toEqual(
      expect.arrayContaining([
        ['filter[]', 'sourcetype.EQ:Payment'],
        ['expand[]', 'refundapplications'],
      ]),
    )
  })

  it('reads each record back by id on the documented retrieve paths', async () => {
    const { sent } = fakeZuora({
      accounts: dataset('accounts', 1),
      payments: dataset('payments', 1),
      refunds: dataset('refunds', 1),
    })
    const a = new ZuoraAdapter()
    expect((await a.getCustomer(CREDS, 'acc_0001')).id).toBe('acc_0001')
    expect((await a.getCharge(CREDS, 'pay_0001')).amount).toBe(1050)
    expect((await a.getRefund(CREDS, 'ref_0001')).chargeId).toBe('pay_for_ref_0001')
    expect(sent.map((s) => s.path)).toEqual([
      '/object-query/accounts/acc_0001',
      '/object-query/payments/pay_0001',
      '/object-query/refunds/ref_0001',
    ])
    expect(sent[0]!.query).toEqual([['expand[]', 'billto']])
    expect(sent[2]!.query).toEqual([['expand[]', 'refundapplications']])
  })

  it('keeps the original US Production (Cloud 2) host for a connection stored without an environment', async () => {
    const { sent } = fakeZuora({ payments: dataset('payments', 1) })
    await callPage('listCharges', 1, 5, { accessToken: 'tok_old' })
    expect(sent[0]!.baseURL).toBe('https://rest.zuora.com')
  })
})

describe('Zuora cursor-pager scope', () => {
  const cursorOf = (s: Sent) => s.query.find(([k]) => k === 'cursor')?.[1]

  it('keeps a walk across a token refresh: the scope is the OAuth client, not the access token', async () => {
    const { sent } = fakeZuora({ payments: dataset('payments', 12) })
    await callPage('listCharges', 1, 5)
    const refreshed = { ...CREDS, accessToken: 'tok_b' }
    await callPage('listCharges', 2, 5, refreshed)
    // Page 2 continues from page 1's nextPage: one request, with a cursor.
    expect(sent).toHaveLength(2)
    expect(cursorOf(sent[1]!)).toBeDefined()
  })

  it('does not share a walk between connections to different hosts', async () => {
    const { sent } = fakeZuora({ payments: dataset('payments', 12) })
    await callPage('listCharges', 1, 5)
    const us = { ...CREDS, extra: { ...CREDS.extra, baseUrl: 'https://rest.zuora.com' } }
    await callPage('listCharges', 2, 5, us)
    const onUs = sent.filter((s) => s.baseURL === 'https://rest.zuora.com')
    // The US connection walks its own chain from page 1.
    expect(onUs).toHaveLength(2)
    expect(cursorOf(onUs[0]!)).toBeUndefined()
  })

  it('does not share a walk between different OAuth clients on one host', async () => {
    const { sent } = fakeZuora({ payments: dataset('payments', 12) })
    await callPage('listCharges', 1, 5)
    const other = { ...CREDS, extra: { ...CREDS.extra, clientId: 'cid_2' } }
    await callPage('listCharges', 2, 5, other)
    expect(sent).toHaveLength(3)
    expect(cursorOf(sent[1]!)).toBeUndefined()
  })
})

describe('Zuora getRefund of a non-payment refund', () => {
  it.each(['CreditMemo', 'CreditBalance'])(
    'answers 404 NOT_FOUND for a %s refund, which listRefunds never returns',
    async (sourceType) => {
      fakeZuora({ refunds: [row('refunds', 7, sourceType)] })
      await expect(new ZuoraAdapter().getRefund(CREDS, 'ref_0007')).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
      })
    },
  )
})

describe('Zuora payouts', () => {
  it.each(['listPayouts', 'getPayout'] as const)(
    '%s refuses with 501 NOT_SUPPORTED and sends nothing',
    async (m) => {
      const { get } = fakeZuora({})
      const post = vi.spyOn(axios, 'post')
      const a = new ZuoraAdapter()
      const call =
        m === 'listPayouts'
          ? a.listPayouts(CREDS, { page: 1, limit: 10 })
          : a.getPayout(CREDS, 'po_1')
      await expect(call).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
      expect(get).not.toHaveBeenCalled()
      expect(post).not.toHaveBeenCalled()
    },
  )
})

describe('Zuora auth (client credentials)', () => {
  it('mints a token at POST <env host>/oauth/token with grant_type=client_credentials', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({
      data: { access_token: 'tok_new', expires_in: 3600, scope: 'x', token_type: 'bearer' },
    })
    const creds = await new ZuoraAdapter().exchangeCredentials({
      environment: 'apac-production',
      clientId: 'cid',
      clientSecret: 'secret',
    })
    const [url, body] = post.mock.calls[0]!
    expect(url).toBe('https://rest.ap.zuora.com/oauth/token')
    expect(Object.fromEntries(new URLSearchParams(String(body)))).toEqual({
      client_id: 'cid',
      client_secret: 'secret',
      grant_type: 'client_credentials',
    })
    expect(creds.accessToken).toBe('tok_new')
    expect(creds.extra).toEqual({
      clientId: 'cid',
      clientSecret: 'secret',
      baseUrl: 'https://rest.ap.zuora.com',
    })
  })

  it('refreshes by minting a new token from the stored client', async () => {
    const post = vi
      .spyOn(axios, 'post')
      .mockResolvedValue({ data: { access_token: 'tok_2', expires_in: 60 } })
    const creds = await new ZuoraAdapter().refreshCredentials(CREDS)
    expect(post.mock.calls[0]![0]).toBe('https://rest.eu.zuora.com/oauth/token')
    expect(creds.accessToken).toBe('tok_2')
  })

  it('rejects an environment outside the documented base-URL table', async () => {
    await expect(
      new ZuoraAdapter().exchangeCredentials({
        environment: 'mars',
        clientId: 'a',
        clientSecret: 'b',
      }),
    ).rejects.toThrow(/Unknown Zuora environment/)
  })

  it('has no authorization-code flow', () => {
    expect(() => new ZuoraAdapter().getAuthUrl()).toThrow(/client credentials/)
  })
})

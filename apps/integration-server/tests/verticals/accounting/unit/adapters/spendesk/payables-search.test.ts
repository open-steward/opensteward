/**
 * Spendesk payables list through POST /v1/payables/search and read back
 * through GET /v1/payables/{id}.
 *
 * v1 removed the synchronous GET /v1/payables list ("The synchronous endpoint
 * to retrieve payables has been removed in favor of the asynchronous one"),
 * which every payables list here used to call with `types[]`, `exportedAfter`
 * and a `cursor` query param. The fake below serves only the documented
 * search body — `filters`, `limit`, `cursor`, `sort` — and rejects anything
 * else, the way the schema's `additionalProperties: false` would.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import { _resetCursorPager, readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { QueryParams } from '../../../../../../src/verticals/accounting/adapter/interface'
import { SpendeskAdapter } from '../../../../../../src/verticals/accounting/adapters/spendesk/index'
import type { SpendeskSearchPayable } from '../../../../../../src/verticals/accounting/adapters/spendesk/transform/expense'
import { InvoiceSchema } from '../../../../../../src/verticals/accounting/schema/invoice'
import { CreditMemoSchema } from '../../../../../../src/verticals/accounting/schema/creditmemo'
import { ExpenseSchema } from '../../../../../../src/verticals/accounting/schema/expense'
import { payable, searchPayable } from './fixtures'

const CREDS = { accessToken: 'tok' }
const BODY_KEYS = new Set(['filters', 'limit', 'cursor', 'sort'])

interface Row {
  payableType: string
  lastUpdatedAt: string
  raw: SpendeskSearchPayable
}

type Filter = { field?: string; operator: string; value?: unknown; subfilters?: Filter[] }

function matches(row: Row, f: Filter | undefined): boolean {
  if (!f) return true
  if (f.operator === 'and') return (f.subfilters ?? []).every((s) => matches(row, s))
  if (f.field === 'payableType' && f.operator === '=') {
    return (f.value as string[]).includes(row.payableType)
  }
  if (f.field === 'lastUpdatedAt' && f.operator === 'after') {
    return row.lastUpdatedAt > String(f.value)
  }
  throw new Error(`fake: unsupported filter ${JSON.stringify(f)}`)
}

function fakeSpendesk(rows: Row[], opts: { pageCap?: number } = {}) {
  const posts: Array<{ path: string; body: Record<string, unknown> }> = []
  const gets: string[] = []
  const post = vi.fn(async (path: string, body: Record<string, unknown>) => {
    posts.push({ path, body })
    if (path !== '/v1/payables/search') throw new Error(`fake: no POST ${path}`)
    for (const k of Object.keys(body)) if (!BODY_KEYS.has(k)) throw new Error(`fake: body.${k}`)
    const hits = rows.filter((r) => matches(r, body['filters'] as Filter | undefined))
    const start = body['cursor'] === undefined ? 0 : Number(String(body['cursor']).slice(2))
    const size = Math.min(Number(body['limit'] ?? 20), opts.pageCap ?? Infinity)
    const slice = hits.slice(start, start + size)
    const end = start + slice.length
    return {
      data: {
        nextCursor: end < hits.length ? `c:${end}` : null,
        referencesToRetry: [],
        payables: slice.map((r) => r.raw),
      },
    }
  })
  const get = vi.fn(async (path: string) => {
    gets.push(path)
    const m = /^\/v1\/payables\/([^/?]+)$/.exec(path)
    if (!m) throw new Error(`fake: no GET ${path}`)
    const id = decodeURIComponent(m[1]!)
    const type = id.startsWith('cn')
      ? 'creditNote'
      : id.startsWith('inv')
        ? 'invoicePurchase'
        : 'expenseClaim'
    return { data: payable({ id, type }) }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, post } as never)
  return { posts, gets, post, get }
}

function rows(n: number, payableType: string, prefix: string): Row[] {
  return Array.from({ length: n }, (_, i) => ({
    payableType,
    lastUpdatedAt: `2024-06-${String(10 + i).padStart(2, '0')}T00:00:00.000Z`,
    raw: searchPayable({ id: `${prefix}-${i}` }),
  }))
}

const adapter = () => new SpendeskAdapter({ clientId: 'c', clientSecret: 's' })
const params = (p: QueryParams): QueryParams => withPageSink({ ...p })

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe('Spendesk payables lists: POST /v1/payables/search', () => {
  const cases = [
    ['listExpenses', undefined],
    ['listInvoices', ['invoicePurchase']],
    ['listCreditMemos', ['creditNote']],
  ] as const

  it.each(cases)(
    '%s sends the documented body only, filtered by payableType',
    async (method, types) => {
      const fake = fakeSpendesk([
        ...rows(2, 'invoicePurchase', 'inv'),
        ...rows(2, 'creditNote', 'cn'),
      ])
      await adapter()[method](CREDS, params({ page: 1, limit: 10 }))
      expect(fake.gets).toEqual([])
      expect(fake.posts).toHaveLength(1)
      expect(fake.posts[0]!.path).toBe('/v1/payables/search')
      expect(fake.posts[0]!.body).toEqual(
        types
          ? { limit: 10, filters: { field: 'payableType', operator: '=', value: types } }
          : { limit: 10 },
      )
    },
  )

  it('listInvoices returns only invoicePurchase payables, listCreditMemos only creditNote', async () => {
    fakeSpendesk([...rows(2, 'invoicePurchase', 'inv'), ...rows(3, 'creditNote', 'cn')])
    const inv = await adapter().listInvoices(CREDS, params({ page: 1, limit: 10 }))
    const cn = await adapter().listCreditMemos(CREDS, params({ page: 1, limit: 10 }))
    expect(inv.map((r) => r.id)).toEqual(['inv-0', 'inv-1'])
    expect(inv.every((r) => r.type === 'BILL')).toBe(true)
    expect(cn.map((r) => r.id)).toEqual(['cn-0', 'cn-1', 'cn-2'])
    for (const r of inv) expect(() => InvoiceSchema.parse(r)).not.toThrow()
    for (const r of cn) expect(() => CreditMemoSchema.parse(r)).not.toThrow()
  })

  it('updatedAfter is a lastUpdatedAt `after` filter, and-ed with the type', async () => {
    const fake = fakeSpendesk(rows(5, 'invoicePurchase', 'inv'))
    const since = new Date('2024-06-12T00:00:00.000Z')
    const out = await adapter().listInvoices(
      CREDS,
      params({ page: 1, limit: 10, updatedAfter: since }),
    )
    expect(fake.posts[0]!.body['filters']).toEqual({
      operator: 'and',
      subfilters: [
        { field: 'payableType', operator: '=', value: ['invoicePurchase'] },
        { field: 'lastUpdatedAt', operator: 'after', value: '2024-06-12T00:00:00.000Z' },
      ],
    })
    expect(out.map((r) => r.id)).toEqual(['inv-3', 'inv-4'])
  })

  it('updatedAfter alone on listExpenses is a single leaf filter', async () => {
    const fake = fakeSpendesk(rows(3, 'expenseClaim', 'exp'))
    await adapter().listExpenses(
      CREDS,
      params({ page: 1, limit: 5, updatedAfter: new Date('2024-06-10T00:00:00.000Z') }),
    )
    expect(fake.posts[0]!.body['filters']).toEqual({
      field: 'lastUpdatedAt',
      operator: 'after',
      value: '2024-06-10T00:00:00.000Z',
    })
  })

  it.each(cases)('%s walks N = 2L+1 rows: every id once, hasMore exact', async (method, types) => {
    const L = 3
    const type = types?.[0] ?? 'expenseClaim'
    const fake = fakeSpendesk(rows(2 * L + 1, type, 'row'))
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 4; page++) {
      const p = params({ page, limit: L })
      const out = await adapter()[method](CREDS, p)
      seen.push(...out.map((r) => r.id!))
      more.push(readUpstreamPage(p)?.hasMore)
      expect(readUpstreamPage(p)?.pageSize).toBeUndefined()
    }
    expect(seen).toEqual(Array.from({ length: 2 * L + 1 }, (_, i) => `row-${i}`))
    expect(more).toEqual([true, true, false, false])
    // Sequential pages carry each cursor forward: one request per page, and
    // page 4 is known empty without one.
    expect(fake.posts.map((c) => c.body['cursor'])).toEqual([undefined, 'c:3', 'c:6'])
  })

  it('a limit above 30 is sent as 30 and reported as the page size', async () => {
    const fake = fakeSpendesk(rows(40, 'invoicePurchase', 'inv'))
    const p = params({ page: 1, limit: 100 })
    const out = await adapter().listInvoices(CREDS, p)
    expect(fake.posts[0]!.body['limit']).toBe(30)
    expect(out).toHaveLength(30)
    expect(readUpstreamPage(p)).toMatchObject({ pageSize: 30, hasMore: true })
  })

  it('a server page shorter than the limit still ends only on a null nextCursor', async () => {
    fakeSpendesk(rows(5, 'invoicePurchase', 'inv'), { pageCap: 2 })
    const p = params({ page: 1, limit: 3 })
    const out = await adapter().listInvoices(CREDS, p)
    expect(out.map((r) => r.id)).toEqual(['inv-0', 'inv-1'])
    expect(readUpstreamPage(p)?.hasMore).toBe(true)
  })

  // The three lists share one search path, so the cursor pager key must carry
  // the filters: page N of one search must never resume another's cursor chain.
  it('a different type filter walks its own cursor chain', async () => {
    fakeSpendesk([...rows(2, 'invoicePurchase', 'inv'), ...rows(7, 'creditNote', 'cn')])
    await adapter().listInvoices(CREDS, params({ page: 1, limit: 3 }))
    const out = await adapter().listCreditMemos(CREDS, params({ page: 2, limit: 3 }))
    expect(out.map((r) => r.id)).toEqual(['cn-3', 'cn-4', 'cn-5'])
  })

  it('a different updatedAfter walks its own cursor chain', async () => {
    fakeSpendesk(rows(7, 'invoicePurchase', 'inv'))
    await adapter().listInvoices(
      CREDS,
      params({ page: 1, limit: 3, updatedAfter: new Date('2024-06-14T00:00:00.000Z') }),
    )
    const out = await adapter().listInvoices(CREDS, params({ page: 2, limit: 3 }))
    expect(out.map((r) => r.id)).toEqual(['inv-3', 'inv-4', 'inv-5'])
  })
})

describe('Spendesk payables gets: GET /v1/payables/{id}', () => {
  it('getExpense reads the payable by id', async () => {
    const fake = fakeSpendesk([])
    const out = await adapter().getExpense(CREDS, 'exp-1')
    expect(fake.gets).toEqual(['/v1/payables/exp-1'])
    expect(fake.posts).toEqual([])
    expect(out.id).toBe('exp-1')
    expect(() => ExpenseSchema.parse(out)).not.toThrow()
  })

  it('getInvoice and getCreditMemo read their own type', async () => {
    const fake = fakeSpendesk([])
    expect((await adapter().getInvoice(CREDS, 'inv-1')).invoiceNumber).toBe('SUPP-INV-100')
    expect((await adapter().getCreditMemo(CREDS, 'cn-1')).id).toBe('cn-1')
    expect(fake.gets).toEqual(['/v1/payables/inv-1', '/v1/payables/cn-1'])
  })

  it('a payable of another type is not found', async () => {
    fakeSpendesk([])
    await expect(adapter().getInvoice(CREDS, 'exp-1')).rejects.toMatchObject({ statusCode: 404 })
    await expect(adapter().getCreditMemo(CREDS, 'inv-1')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('a 200 without a payable id is not found', async () => {
    const get = vi.fn(async () => ({ data: {} }))
    vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
    await expect(adapter().getExpense(CREDS, 'exp-1')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('escapes the id into the path', async () => {
    const fake = fakeSpendesk([])
    await adapter().getExpense(CREDS, 'a/b')
    expect(fake.gets).toEqual(['/v1/payables/a%2Fb'])
  })
})

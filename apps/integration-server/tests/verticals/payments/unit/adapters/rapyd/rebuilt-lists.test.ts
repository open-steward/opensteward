/**
 * Rapyd invoices, payouts, plans, subscriptions and payment methods: the
 * documented paths and their paging.
 *
 *   GET /v1/invoices                https://docs.rapyd.net/en/list-invoices.html
 *     ending_before: "The ID of the invoice created after the last invoice you want to retrieve."
 *   GET /v1/payouts                 https://docs.rapyd.net/en/list-payouts.html
 *     created_before: "The ID of the payout created after the last payout you want to retrieve."
 *   GET /v1/plans                   https://docs.rapyd.net/en/list-plans.html
 *     ending_before: "The ID of the plan created after the last plan you want to retrieve."
 *   GET /v1/payments/subscriptions  https://docs.rapyd.net/en/list-subscriptions.html
 *     ending_before: "The list ends with the last record that was created before the record with this ID."
 *     starting_after: "The list begins with the record that was created next after the record with this ID."
 *   GET /v1/customers/:customer/payment_methods
 *                                   https://docs.rapyd.net/en/list-payment-methods-of-customer.html
 *     ending_before: "The ID of the payment method created after the last payment method you want to retrieve."
 *   every list: limit "Range: 1-100.", default 10; envelope { status, data: [...] }, no has_more.
 *
 * The fake upstream sits at the axios seam and honours ONLY `limit` and the
 * documented keyset params of each path; anything else is a 400, and so is
 * any path the docs do not name. Rows are newest first, as in every
 * multi-row Rapyd list example (list-payouts, list-customers, list-invoices,
 * list-payments, list-refunds). Each keyset param does what its doc sentence
 * says: an "older" key (ending_before, created_before) returns rows created
 * before the anchor, a "newer" key (starting_after, created_after) returns
 * rows created after it. Sending the newer key as the next-page cursor
 * therefore re-reads rows already seen.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  withPageSink,
  readUpstreamPage,
  _resetCursorPager,
  _resetRowPager,
} from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { RapydAdapter } from '../../../../../../src/verticals/payments/adapters/rapyd/index'

const CREDS: Credentials = {
  accessToken: 'rak_a',
  extra: { secretKey: 'rsk_a', environment: 'sandbox' },
}
const MAX = 100

type Method = 'listInvoices' | 'listPayouts' | 'listPlans' | 'listSubscriptions'
type Getter = 'getInvoice' | 'getPayout' | 'getPlan' | 'getSubscription'

interface Case {
  method: Method
  getter: Getter
  path: string
  keyset: string
  /** The documented key that returns rows created AFTER the anchor, if any. */
  newer?: string
  row: (id: string) => Record<string, unknown>
}

const CASES: Case[] = [
  {
    method: 'listInvoices',
    getter: 'getInvoice',
    path: '/invoices',
    keyset: 'ending_before',
    row: (id) => ({ id, currency: 'USD', total: 5, status: 'open' }),
  },
  {
    method: 'listPayouts',
    getter: 'getPayout',
    path: '/payouts',
    keyset: 'created_before',
    newer: 'created_after',
    row: (id) => ({ id, amount: 110, payout_currency: 'EUR', status: 'Completed' }),
  },
  {
    method: 'listPlans',
    getter: 'getPlan',
    path: '/plans',
    keyset: 'ending_before',
    row: (id) => ({
      id,
      amount: 9.99,
      currency: 'USD',
      billing_scheme: 'per_unit',
      interval: 'month',
    }),
  },
  {
    method: 'listSubscriptions',
    getter: 'getSubscription',
    path: '/payments/subscriptions',
    keyset: 'ending_before',
    newer: 'starting_after',
    row: (id) => ({ id, customer_token: 'cus_1', status: 'active' }),
  },
]

function badRequest(msg: string): Error {
  return Object.assign(new Error(`400 ${msg}`), { response: { status: 400 } })
}

/** Ids newest first, the order Rapyd lists them in. */
function build(n: number, prefix = 'r'): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}_${String(n - i).padStart(4, '0')}`)
}

interface Call {
  path: string
  params: Record<string, string>
}

/**
 * A keyset page of `ids` (newest first) per the documented params, or a 400.
 * `keyset` returns the rows created before the anchor; `newer`, when the
 * path documents one, returns those created after it.
 */
function keysetPage(
  ids: string[],
  params: Record<string, string>,
  keyset: string,
  newer?: string,
): string[] {
  for (const k of Object.keys(params)) {
    if (k !== 'limit' && k !== keyset && k !== newer) throw badRequest(`unknown param ${k}`)
  }
  if (params[keyset] !== undefined && newer !== undefined && params[newer] !== undefined)
    throw badRequest('both keyset params')
  const limit = params['limit'] === undefined ? 10 : Number(params['limit'])
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX)
    throw badRequest(`limit ${String(params['limit'])}`)
  let start = 0
  const after = params[keyset]
  if (after !== undefined) {
    const at = ids.indexOf(after)
    if (at < 0) throw badRequest(`unknown ${keyset}`)
    start = at + 1
  }
  const before = newer === undefined ? undefined : params[newer]
  if (before !== undefined) {
    const at = ids.indexOf(before)
    if (at < 0) throw badRequest(`unknown ${newer}`)
    return ids.slice(Math.max(0, at - limit), at)
  }
  return ids.slice(start, start + limit)
}

function fake(c: Case, ids: string[]) {
  const calls: Call[] = []
  const get = vi.fn(async (pathWithQuery: string) => {
    const [path, qs = ''] = pathWithQuery.split('?')
    const params = Object.fromEntries(new URLSearchParams(qs))
    calls.push({ path: path!, params })
    if (path === c.path) {
      return {
        data: {
          status: { status: 'SUCCESS' },
          data: keysetPage(ids, params, c.keyset, c.newer).map(c.row),
        },
      }
    }
    const one = path!.startsWith(`${c.path}/`) ? path!.slice(c.path.length + 1) : undefined
    if (one !== undefined && ids.includes(one) && qs === '') {
      return { data: { status: { status: 'SUCCESS' }, data: c.row(one) } }
    }
    throw Object.assign(new Error('UNAUTHORIZED_API_CALL'), { response: { status: 401 } })
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
  return { get, calls }
}

afterEach(() => {
  vi.restoreAllMocks()
  _resetCursorPager()
  _resetRowPager()
})

describe('Rapyd rebuilt lists', () => {
  for (const c of CASES) {
    describe(c.method, () => {
      it(`walks 2L+1 rows of GET /v1${c.path} once each with exact hasMore`, async () => {
        for (const L of [3, 10]) {
          _resetCursorPager()
          vi.restoreAllMocks()
          const ids = build(2 * L + 1)
          const { calls } = fake(c, ids)
          const a = new RapydAdapter()
          const seen: string[] = []
          const hasMore: (boolean | undefined)[] = []
          for (const page of [1, 2, 3]) {
            const params = withPageSink({ page, limit: L } as QueryParams)
            const rows = (await a[c.method](CREDS, params)) as { id: string }[]
            seen.push(...rows.map((r) => r.id))
            hasMore.push(readUpstreamPage(params)?.hasMore)
          }
          expect(seen).toEqual(ids)
          expect(hasMore).toEqual([true, true, false])
          for (const x of calls) expect(x.path).toBe(c.path)
        }
      })

      it(`page 2 sends only limit and the documented \`${c.keyset}\` = last id of page 1`, async () => {
        const L = 4
        const ids = build(2 * L + 1)
        const { calls } = fake(c, ids)
        const params = withPageSink({ page: 2, limit: L } as QueryParams)
        const rows = (await new RapydAdapter()[c.method](CREDS, params)) as { id: string }[]
        expect(rows.map((r) => r.id)).toEqual(ids.slice(L, 2 * L))
        expect(calls.map((x) => x.params)).toEqual([
          { limit: String(L) },
          { limit: String(L), [c.keyset]: ids[L - 1] },
        ])
      })

      it('clamps a limit above 100 and reports the size sent', async () => {
        const ids = build(MAX + 5)
        const { calls } = fake(c, ids)
        const params = withPageSink({ page: 1, limit: 500 } as QueryParams)
        const rows = (await new RapydAdapter()[c.method](CREDS, params)) as unknown[]
        expect(rows).toHaveLength(MAX)
        expect(readUpstreamPage(params)).toMatchObject({ hasMore: true, pageSize: MAX })
        expect(calls[0]!.params).toEqual({ limit: String(MAX) })
      })

      it(`${c.getter} reads GET /v1${c.path}/:id`, async () => {
        const ids = build(3)
        const { calls } = fake(c, ids)
        const got = (await new RapydAdapter()[c.getter](CREDS, ids[1]!)) as { id: string }
        expect(got.id).toBe(ids[1])
        expect(calls).toEqual([{ path: `${c.path}/${ids[1]}`, params: {} }])
      })
    })
  }
})

// ── Payment methods: a fan-out over customers ───────────────────────────

const CUSTOMER_KEYSET = 'ending_before'
const PM_KEYSET = 'ending_before'

/** customers newest first; methods[c] newest first. */
function fakeWallets(customers: string[], methods: Record<string, string[]>) {
  const calls: Call[] = []
  const get = vi.fn(async (pathWithQuery: string) => {
    const [path, qs = ''] = pathWithQuery.split('?')
    const params = Object.fromEntries(new URLSearchParams(qs))
    calls.push({ path: path!, params })
    if (path === '/customers') {
      return {
        data: {
          status: { status: 'SUCCESS' },
          data: keysetPage(customers, params, CUSTOMER_KEYSET).map((id) => ({ id })),
        },
      }
    }
    const m = /^\/customers\/([^/]+)\/payment_methods$/.exec(path!)
    if (m && methods[m[1]!]) {
      return {
        data: {
          status: { status: 'SUCCESS' },
          data: keysetPage(methods[m[1]!]!, params, PM_KEYSET).map((id) => ({
            id,
            type: 'gb_visa_card',
            category: 'card',
          })),
        },
      }
    }
    throw Object.assign(new Error('UNAUTHORIZED_API_CALL'), { response: { status: 401 } })
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
  return { get, calls }
}

function walletFixture(nCustomers: number, perCustomer: (i: number) => number) {
  const customers = build(nCustomers, 'cus')
  const methods: Record<string, string[]> = {}
  const expected: { id: string; customerId: string }[] = []
  customers.forEach((cus, i) => {
    methods[cus] = build(perCustomer(i), `card_${cus}`)
    for (const id of methods[cus]!) expected.push({ id, customerId: cus })
  })
  return { customers, methods, expected }
}

async function walk(a: RapydAdapter, limit: number) {
  const seen: { id: string; customerId?: string }[] = []
  const hasMore: (boolean | undefined)[] = []
  for (let page = 1; ; page++) {
    expect(page).toBeLessThan(200)
    const params = withPageSink({ page, limit } as QueryParams)
    const rows = await a.listPaymentMethods(CREDS, params)
    seen.push(...rows.map((r) => ({ id: r.id, customerId: r.customerId })))
    const more = readUpstreamPage(params)?.hasMore
    hasMore.push(more)
    if (!more) break
  }
  return { seen, hasMore }
}

describe('Rapyd listPaymentMethods', () => {
  it('walks 2L+1 methods across uneven customers once each, with exact hasMore', async () => {
    // 0, 1, 2, 0, 1, 2, 1 methods: 7 rows = 2×3+1.
    const counts = [0, 1, 2, 0, 1, 2, 1]
    const { customers, methods, expected } = walletFixture(counts.length, (i) => counts[i]!)
    expect(expected).toHaveLength(7)
    fakeWallets(customers, methods)
    const { seen, hasMore } = await walk(new RapydAdapter(), 3)
    expect(seen).toEqual(expected)
    expect(hasMore).toEqual([true, true, false])
  })

  it('follows both the customer keyset past 100 customers and a customer with over 100 methods', async () => {
    const { customers, methods, expected } = walletFixture(MAX + 7, (i) =>
      i === 3 ? MAX + 2 : i % 3,
    )
    const { calls } = fakeWallets(customers, methods)
    const { seen, hasMore } = await walk(new RapydAdapter(), 25)
    expect(seen).toEqual(expected)
    expect(hasMore.slice(0, -1).every((h) => h === true)).toBe(true)
    expect(hasMore.at(-1)).toBe(false)
    const customerCalls = calls.filter((x) => x.path === '/customers')
    expect(customerCalls.map((x) => x.params)).toEqual([
      { limit: String(MAX) },
      { limit: String(MAX), ending_before: customers[MAX - 1] },
    ])
    const big = customers[3]!
    expect(
      calls.filter((x) => x.path === `/customers/${big}/payment_methods`).map((x) => x.params),
    ).toEqual([
      { limit: String(MAX) },
      { limit: String(MAX), ending_before: methods[big]![MAX - 1] },
    ])
  })

  it('never calls the undocumented account-wide /payment_methods', async () => {
    const { customers, methods } = walletFixture(2, () => 1)
    const { calls } = fakeWallets(customers, methods)
    await new RapydAdapter().listPaymentMethods(
      CREDS,
      withPageSink({ page: 1, limit: 5 } as QueryParams),
    )
    expect(calls.some((x) => x.path === '/payment_methods')).toBe(false)
  })

  it('throws on a customer row with no id instead of skipping its payment methods', async () => {
    const get = vi.fn(async (pathWithQuery: string) => {
      const [path] = pathWithQuery.split('?')
      if (path === '/customers') {
        return { data: { status: { status: 'SUCCESS' }, data: [{ id: 'cus_1' }, { name: 'x' }] } }
      }
      return { data: { status: { status: 'SUCCESS' }, data: [] } }
    })
    vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
    await expect(
      new RapydAdapter().listPaymentMethods(
        CREDS,
        withPageSink({ page: 1, limit: 5 } as QueryParams),
      ),
    ).rejects.toThrow(/no id/)
  })

  it('getPaymentMethod refuses 501 NOT_SUPPORTED without sending a request', async () => {
    const get = vi.fn()
    const create = vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
    await expect(new RapydAdapter().getPaymentMethod(CREDS, 'card_x')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(get).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })
})

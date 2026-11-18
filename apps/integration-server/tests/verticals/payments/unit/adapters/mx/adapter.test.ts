/**
 * MX request shape, auth and paging.
 *
 * https://docs.mx.com/openapi/platform-api/v20250224.yaml:
 *   servers: https://int-api.mx.com, https://api.mx.com
 *   basicAuth: "include your Base64-encoded `client_id` and `api_key` in the
 *     Authorization header of every request: -H 'Authorization: Basic
 *     BASE_64_ENCODING_OF{client_id:api_key}'"
 *   acceptVersion: header `Accept-Version`, required, default `v20250224`
 *   page: "Results are paginated. Specify current page."
 *   records_per_page: "Defaults to `25`. The valid range is from `10` to
 *     `1000`. If the value exceeds `1000`, the default value of `25` will be
 *     used instead."
 *   GET /users -> UsersResponseBody { users, pagination }
 *   GET /users/{user_identifier} -> UserResponseBody { user }
 *   GET /users/{user_identifier}/accounts -> AccountsResponseBody { accounts, pagination }
 *   GET /users/{user_guid}/accounts/{account_guid} -> AccountResponseBody { account }
 *   PaginationResponse { current_page, per_page, total_entries, total_pages }
 *
 * The fake honours only `page` and `records_per_page`, rejects any other
 * query parameter and a records_per_page below 10, answers 25 a page past
 * 1,000 as MX documents, and 404s every path the spec does not have.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import axios, { type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios'
import {
  _resetCursorPager,
  _resetRowPager,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { MxAdapter } from '../../../../../../src/verticals/payments/adapters/mx/index'
import { CustomerSchema } from '../../../../../../src/verticals/payments/schema/customer'
import { PaymentMethodSchema } from '../../../../../../src/verticals/payments/schema/payment-method'

const ORIGIN = 'https://api.mx.com'
const DOCUMENTED = new Set(['page', 'records_per_page'])
const adapter = new MxAdapter()

let CREDS = { accessToken: '' }
let seen: URL[] = []
/** Lets one test reshape a response body; reset before every test. */
type Reshape = (path: string, body: Record<string, unknown>) => Record<string, unknown>
const keep: Reshape = (_path, body) => body
let reshape: Reshape = keep
const dropPagination = (body: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(body).filter(([k]) => k !== 'pagination'))
const realAdapter = axios.defaults.adapter

function httpError(status: number, message: string): Error {
  return Object.assign(new Error(message), { response: { status, data: { message } } })
}

const userGuidOf = (i: number) => `USR-${String(i).padStart(4, '0')}`

function user(i: number): Record<string, unknown> {
  return {
    email: `u${i}@example.com`,
    guid: userGuidOf(i),
    id: null,
    is_disabled: false,
    metadata: null,
  }
}

function account(u: number, j: number): Record<string, unknown> {
  return {
    guid: `ACT-${String(u).padStart(4, '0')}-${String(j).padStart(4, '0')}`,
    user_guid: userGuidOf(u),
    type: 'CHECKING',
    created_at: '2025-02-13T18:08:00+00:00',
    updated_at: '2025-02-13T18:09:00+00:00',
  }
}

interface World {
  users: Record<string, unknown>[]
  accounts: Map<string, Record<string, unknown>[]>
}

function world(userCount: number, accountsOf: (i: number) => number = () => 0): World {
  const users = Array.from({ length: userCount }, (_, i) => user(i))
  const accounts = new Map<string, Record<string, unknown>[]>()
  for (let i = 0; i < userCount; i++)
    accounts.set(
      userGuidOf(i),
      Array.from({ length: accountsOf(i) }, (_, j) => account(i, j)),
    )
  return { users, accounts }
}

function paged(rows: Record<string, unknown>[], url: URL) {
  for (const k of url.searchParams.keys())
    if (!DOCUMENTED.has(k)) throw httpError(400, `unknown parameter ${k}`)
  const page = url.searchParams.has('page') ? Number(url.searchParams.get('page')) : 1
  let per = url.searchParams.has('records_per_page')
    ? Number(url.searchParams.get('records_per_page'))
    : 25
  if (per < 10) throw httpError(400, 'records_per_page below 10')
  if (per > 1000) per = 25
  return {
    slice: rows.slice((page - 1) * per, page * per),
    pagination: {
      current_page: page,
      per_page: per,
      total_entries: rows.length,
      total_pages: Math.ceil(rows.length / per),
    },
  }
}

function fakeMx(w: World): void {
  seen = []
  const transport = async (config: InternalAxiosRequestConfig) => {
    const url = new URL(axios.getUri(config))
    seen.push(url)
    const h = (name: string) => String(config.headers?.get?.(name) ?? config.headers?.[name] ?? '')
    if (url.origin !== ORIGIN) throw httpError(404, `no such host ${url.origin}`)
    const expected = `Basic ${Buffer.from('CLIENT_A:KEY_A').toString('base64')}`
    if (h('Authorization') !== expected) throw httpError(401, 'bad basic auth')
    if (h('Accept-Version') !== 'v20250224') throw httpError(400, 'Accept-Version required')
    const ok = (data: Record<string, unknown>) => ({
      data: reshape(url.pathname, data),
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
      request: {},
    })

    const p = url.pathname
    if (p === '/users') {
      const { slice, pagination } = paged(w.users, url)
      return ok({ users: slice, pagination })
    }
    let m = /^\/users\/([^/]+)$/.exec(p)
    if (m) {
      const u = w.users.find((x) => x.guid === decodeURIComponent(m![1]!))
      if (!u) throw httpError(404, 'no such user')
      return ok({ user: u })
    }
    m = /^\/users\/([^/]+)\/accounts$/.exec(p)
    if (m) {
      const rows = w.accounts.get(decodeURIComponent(m[1]!))
      if (!rows) throw httpError(404, 'no such user')
      const { slice, pagination } = paged(rows, url)
      return ok({ accounts: slice, pagination })
    }
    m = /^\/users\/([^/]+)\/accounts\/([^/]+)$/.exec(p)
    if (m) {
      const a = w.accounts
        .get(decodeURIComponent(m[1]!))
        ?.find((x) => x.guid === decodeURIComponent(m![2]!))
      if (!a) throw httpError(404, 'no such account')
      return ok({ account: a })
    }
    throw httpError(404, `no route ${p}`)
  }
  axios.defaults.adapter = transport as unknown as AxiosAdapter
}

beforeEach(async () => {
  _resetCursorPager()
  _resetRowPager()
  reshape = keep
  CREDS = await adapter.exchangeCredentials({ clientId: 'CLIENT_A', apiKey: 'KEY_A' })
})
afterEach(() => {
  axios.defaults.adapter = realAdapter
})

async function page<T extends { id: string }>(
  fn: (params: QueryParams) => Promise<T[]>,
  p: number,
  limit: number,
) {
  const params: QueryParams = withPageSink({ page: p, limit })
  const rows = await fn(params)
  return { ids: rows.map((r) => r.id), rows, meta: readUpstreamPage(params) }
}

const customers = (params: QueryParams) => adapter.listCustomers(CREDS, params)
const paymentMethods = (params: QueryParams) => adapter.listPaymentMethods(CREDS, params)

describe('mx auth', () => {
  it('encodes client_id:api_key, as basicAuth documents', async () => {
    const c = await adapter.exchangeCredentials({ clientId: 'CLIENT_A', apiKey: 'KEY_A' })
    expect(Buffer.from(c.accessToken!, 'base64').toString()).toBe('CLIENT_A:KEY_A')
  })

  it('refuses credentials without a client_id', async () => {
    await expect(adapter.exchangeCredentials({ apiKey: 'KEY_A' })).rejects.toThrow(/client_id/)
  })

  it('collects both fields on the Connect Link form', () => {
    expect(adapter.credentialFields().map((f) => f.name)).toEqual(['clientId', 'apiKey'])
  })
})

describe('mx listCustomers', () => {
  it('walks GET /users at a limit MX accepts: 2L+1 users, each once, hasMore exact', async () => {
    const L = 10
    fakeMx(world(2 * L + 1))
    const all = Array.from({ length: 2 * L + 1 }, (_, i) => userGuidOf(i))
    const p1 = await page(customers, 1, L)
    const p2 = await page(customers, 2, L)
    const p3 = await page(customers, 3, L)
    expect([p1.ids, p1.meta?.hasMore]).toEqual([all.slice(0, L), true])
    expect([p2.ids, p2.meta?.hasMore]).toEqual([all.slice(L, 2 * L), true])
    expect([p3.ids, p3.meta?.hasMore]).toEqual([all.slice(2 * L), false])
    expect(seen.map((u) => `${u.pathname}?${u.searchParams.toString()}`)).toEqual([
      '/users?page=1&records_per_page=10',
      '/users?page=2&records_per_page=10',
      '/users?page=3&records_per_page=10',
    ])
    for (const r of p1.rows) CustomerSchema.parse(r)
  })

  it("asks MX for the caller's own page size, 10 to 1,000, and reports the page as cut from rows", async () => {
    // Every size in MX's range is one MX page per caller page, so the size
    // sent follows the limit, and pageByRows cuts the window either way.
    for (const L of [10, 37, 500]) {
      _resetRowPager()
      fakeMx(world(2 * L + 1))
      const all = Array.from({ length: 2 * L + 1 }, (_, i) => userGuidOf(i))
      const p1 = await page(customers, 1, L)
      const p2 = await page(customers, 2, L)
      expect([p1.ids, p1.meta?.hasMore, p1.meta?.pagedLocally]).toEqual([
        all.slice(0, L),
        true,
        true,
      ])
      expect([p2.ids, p2.meta?.hasMore, p2.meta?.pagedLocally]).toEqual([
        all.slice(L, 2 * L),
        true,
        true,
      ])
      expect(new Set(seen.map((u) => u.searchParams.get('records_per_page')))).toEqual(
        new Set([String(L)]),
      )
    }
  })

  it('serves a later page asked for first', async () => {
    const L = 10
    fakeMx(world(3 * L))
    const all = Array.from({ length: 3 * L }, (_, i) => userGuidOf(i))
    const p3 = await page(customers, 3, L)
    expect([p3.ids, p3.meta?.hasMore]).toEqual([all.slice(2 * L), false])
  })

  it('ends on an empty first page', async () => {
    fakeMx(world(0))
    const p1 = await page(customers, 1, 10)
    expect([p1.ids, p1.meta?.hasMore]).toEqual([[], false])
  })

  it('cuts a limit below MX minimum of 10 out of pages of 10', async () => {
    const L = 7
    fakeMx(world(2 * L + 1))
    const all = Array.from({ length: 2 * L + 1 }, (_, i) => userGuidOf(i))
    const p1 = await page(customers, 1, L)
    const p2 = await page(customers, 2, L)
    const p3 = await page(customers, 3, L)
    expect([p1.ids, p1.meta?.hasMore]).toEqual([all.slice(0, L), true])
    expect([p2.ids, p2.meta?.hasMore]).toEqual([all.slice(L, 2 * L), true])
    expect([p3.ids, p3.meta?.hasMore]).toEqual([all.slice(2 * L), false])
    expect(new Set(seen.map((u) => u.searchParams.get('records_per_page')))).toEqual(
      new Set(['10']),
    )
  })

  it('joins pages of MX maximum of 1,000 for a larger limit, never sending more', async () => {
    fakeMx(world(2_500))
    const all = Array.from({ length: 2_500 }, (_, i) => userGuidOf(i))
    const p1 = await page(customers, 1, 2_000)
    const p2 = await page(customers, 2, 2_000)
    expect([p1.ids, p1.meta?.hasMore]).toEqual([all.slice(0, 2_000), true])
    expect([p2.ids, p2.meta?.hasMore]).toEqual([all.slice(2_000), false])
    expect(new Set(seen.map((u) => u.searchParams.get('records_per_page')))).toEqual(
      new Set(['1000']),
    )
  })

  it('sends the documented default of 25 a page when the caller names no limit', async () => {
    fakeMx(world(30))
    const rows = await customers(withPageSink({ page: 1 }))
    expect(rows).toHaveLength(25)
    expect(seen[0]!.searchParams.get('records_per_page')).toBe('25')
  })

  it('throws, rather than ending the collection, on a list without pagination', async () => {
    fakeMx(world(3))
    reshape = (_path, body) => dropPagination(body)
    await expect(page(customers, 1, 10)).rejects.toThrow(/pagination/)
    await expect(page(customers, 1, 7)).rejects.toThrow(/pagination/)
  })

  it('throws on a read with no user in the body', async () => {
    fakeMx(world(3))
    reshape = () => ({})
    await expect(adapter.getCustomer(CREDS, userGuidOf(2))).rejects.toThrow(/no user/)
  })

  it('reads a user back with GET /users/{user_identifier}', async () => {
    fakeMx(world(3))
    const c = CustomerSchema.parse(await adapter.getCustomer(CREDS, userGuidOf(2)))
    expect(c.id).toBe(userGuidOf(2))
    expect(seen.map((u) => u.pathname)).toEqual(['/users/USR-0002'])
  })
})

describe('mx listPaymentMethods', () => {
  // Uneven accounts per user, including none; user 1 spans three account
  // pages of 1,000; 1,003 users span two user pages of 1,000.
  const SHAPE = [0, 1, 3, 0, 2]
  const accountsOf = (i: number) => (i === 1 ? 2_346 : SHAPE[i % SHAPE.length]!)
  const USERS = 1_003

  function expectedIds(users = USERS): string[] {
    const ids: string[] = []
    for (let i = 0; i < users; i++)
      for (let j = 0; j < accountsOf(i); j++)
        ids.push(`${userGuidOf(i)}:ACT-${String(i).padStart(4, '0')}-${String(j).padStart(4, '0')}`)
    return ids
  }

  it('serves 2L+1 accounts over pages 1, 2, 3, each once, hasMore exact', async () => {
    // 13 users: 2,346 + 15 accounts, odd; user 1 spans three account pages.
    fakeMx(world(13, accountsOf))
    const all = expectedIds(13)
    expect(all.length % 2).toBe(1)
    const L = (all.length - 1) / 2
    const p1 = await page(paymentMethods, 1, L)
    const p2 = await page(paymentMethods, 2, L)
    const p3 = await page(paymentMethods, 3, L)
    expect([p1.ids, p1.meta?.hasMore]).toEqual([all.slice(0, L), true])
    expect([p2.ids, p2.meta?.hasMore]).toEqual([all.slice(L, 2 * L), true])
    expect([p3.ids, p3.meta?.hasMore]).toEqual([all.slice(2 * L), false])
    for (const r of p1.rows.slice(0, 5)) PaymentMethodSchema.parse(r)
  })

  it('walks small pages across users, account pages and user pages, every id once', async () => {
    fakeMx(world(USERS, accountsOf))
    const all = expectedIds()
    const got: string[] = []
    let hasMore: boolean | undefined = true
    for (let p = 1; hasMore; p++) {
      const r = await page(paymentMethods, p, 250)
      got.push(...r.ids)
      hasMore = r.meta?.hasMore
      expect(r.ids.length).toBe(hasMore ? 250 : all.length - (p - 1) * 250)
    }
    expect(got).toEqual(all)
    const userPages = seen
      .filter((u) => u.pathname === '/users')
      .map((u) => u.searchParams.get('page'))
    expect(userPages).toEqual(['1', '2'])
    const u1 = seen.filter((u) => u.pathname === '/users/USR-0001/accounts')
    expect(u1.map((u) => u.searchParams.get('page'))).toEqual(['1', '2', '3'])
    expect(new Set(seen.map((u) => u.searchParams.get('records_per_page')))).toEqual(
      new Set(['1000']),
    )
  })

  it('ends on an empty user list without asking for accounts', async () => {
    fakeMx(world(0))
    const r = await page(paymentMethods, 1, 10)
    expect([r.ids, r.meta?.hasMore]).toEqual([[], false])
    expect(seen.map((u) => u.pathname)).toEqual(['/users'])
  })

  it('throws, rather than ending the collection, on a users page without pagination', async () => {
    fakeMx(world(3, () => 1))
    reshape = (_path, body) => dropPagination(body)
    await expect(page(paymentMethods, 1, 10)).rejects.toThrow(/pagination/)
  })

  it('throws, rather than ending the collection, on an accounts page without pagination', async () => {
    fakeMx(world(3, () => 1))
    reshape = (path, body) => (path.endsWith('/accounts') ? dropPagination(body) : body)
    await expect(page(paymentMethods, 1, 10)).rejects.toThrow(/pagination/)
  })

  it('throws on a user without a guid instead of asking for its accounts', async () => {
    const w = world(2, () => 1)
    w.users[0] = { ...w.users[0], guid: null }
    fakeMx(w)
    await expect(page(paymentMethods, 1, 10)).rejects.toThrow(/no guid/)
    expect(seen.map((u) => u.pathname)).toEqual(['/users'])
  })

  it('reads an account back under its user from the id the list returns', async () => {
    fakeMx(world(3, () => 2))
    const [first] = await adapter.listPaymentMethods(CREDS, withPageSink({ page: 1, limit: 1 }))
    seen = []
    const pm = PaymentMethodSchema.parse(await adapter.getPaymentMethod(CREDS, first!.id))
    expect(pm.id).toBe(first!.id)
    expect(seen.map((u) => u.pathname)).toEqual(['/users/USR-0000/accounts/ACT-0000-0000'])
  })

  it('rejects an id without its user before sending anything', async () => {
    fakeMx(world(1, () => 1))
    await expect(adapter.getPaymentMethod(CREDS, 'ACT-0000-0000')).rejects.toMatchObject({
      statusCode: 400,
    })
    expect(seen).toEqual([])
  })
})

describe.each([
  ['listCharges', () => adapter.listCharges(CREDS, withPageSink({ page: 1, limit: 10 }))],
  ['getCharge', () => adapter.getCharge(CREDS, 'x')],
  ['listRefunds', () => adapter.listRefunds(CREDS, withPageSink({ page: 1, limit: 10 }))],
] as const)('mx %s', (_name, call) => {
  it('refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    fakeMx(world(1))
    await expect(call()).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(seen).toEqual([])
  })
})

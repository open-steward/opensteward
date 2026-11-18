/**
 * Paysafe list paging: 1-based `page` + caller's `limit` → Paysafe `limit` +
 * 0-based row `offset`.
 *
 * Paysafe documents both parameters the same way on every list endpoint below.
 * https://developer.paysafe.com/en/support/reference-information/pagination/
 * has a Name | Description table; for `limit` and `offset` the descriptions are
 *
 *   limit:  "This is the total number of records to return. Max = 50. Default = 10."
 *   offset: "This is the starting position, where 0 is the first record. Default = 0."
 *
 * The OpenAPI specs behind the API reference say the same per operation
 * (`maximum: 50` in the `limit` schema, and "This is the starting position,
 * where 0 is the first record." on `offset`):
 *   GET /paymenthub/v1/payments, GET /paymenthub/v1/refunds
 *     https://developer.paysafe.com/fileadmin/openapi-spec/payments-api/apis/paysafe-ph-payments-api.yaml
 *   GET /subscriptionsplans/v1/plans, GET /subscriptionsplans/v1/subscriptions
 *     https://developer.paysafe.com/fileadmin/openapi-spec/subscriptionsplans-api/apis/paysafe-psp-subscriptionsplans-api.yaml
 *
 * So page N starts at row (N - 1) × size, where size is the limit actually sent
 * (after the clamp to 50), and the adapter declares `maxPageSize: 50`.
 *
 * KNOWN GAP, NOT A PAGING DEFECT: the payments and refunds operations are
 * documented as "Get Payments Using Merchant Reference Number" and "Get Refunds
 * Using Merchant Reference Number", with `merchantRefNum` marked
 * `required: true`, and the adapter never sends it. The live API can therefore
 * refuse listCharges/listRefunds whatever the paging does, and even with the
 * parameter they cover only the documented `startDate` default ("Default = 30
 * days before the endDate."). These tests pin the paging arithmetic only; they
 * do not show that either method lists anything in production.
 *
 * listCustomers is refused before any request (501 NOT_SUPPORTED). Paysafe's
 * Customer Vault API blueprint
 * (https://github.com/paysafegroup/paysafe_api_customervault_v1, file
 * paysafeapicustomervaultv1-apiary.apib) documents GET on /v1/profiles only as
 *
 *   "## Get Profile Using Merchant Customer ID
 *    [GET /v1/profiles?merchantCustomerId={merchantCustomerId}]"
 *   "This is how you look up a profile using the Merchant Customer ID that was
 *    used in the original request."
 *   + merchantCustomerId (string, required)
 *
 * one profile back, with no limit or offset, so there is no list of profiles.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { parseListQuery, withPageSink, type QueryParams } from '@opensteward/shared'
import { PaysafeAdapter } from '../../../../../../src/verticals/payments/adapters/paysafe/index'

const CREDS = { accessToken: 'a2V5OnB3ZA==' }
/** Documented: "Max = 50." */
const PAYSAFE_MAX = 50
/** Documented: "Default = 10." */
const PAYSAFE_DEFAULT = 10
/** Documented: "Default = 0." */
const PAYSAFE_OFFSET_DEFAULT = 0
/** The adapter's own size for a direct call that names no limit. */
const ADAPTER_DEFAULT = 50
const N_ROWS = 1000

/**
 * Every query parameter each operation documents, from the two specs above.
 * `merchantRefNum` is `required: true` on payments and refunds; the fake does
 * not enforce that (see KNOWN GAP above), but it does accept it.
 */
const DOCUMENTED: Record<string, string[]> = {
  payments: ['merchantRefNum', 'limit', 'offset', 'startDate', 'endDate'],
  refunds: ['merchantRefNum', 'limit', 'offset', 'startDate', 'endDate'],
  plans: ['name', 'status', 'limit', 'offset', 'startTime', 'endTime'],
  subscriptions: [
    'merchantRefNum',
    'planId',
    'customerId',
    'fields',
    'limit',
    'offset',
    'startTime',
    'status',
  ],
}

/**
 * A fake Paysafe list endpoint. `limit` (1..50, default 10) and `offset`
 * (0-based row position, default 0) drive the slice. The operation's other
 * documented parameters are accepted but not modelled (the adapter sends none
 * of them); anything undocumented, or a paging value out of range, is refused.
 */
function fakePaysafe(path: string, key: string, total: number) {
  const all = Array.from({ length: total }, (_, i) => ({ id: String(i + 1) }))
  const documented = DOCUMENTED[key] ?? []
  const get = vi.fn(async (p: string, cfg?: { params?: Record<string, unknown> }) => {
    if (p !== path) throw new Error(`unexpected path ${p} (expected ${path})`)
    const params = cfg?.params ?? {}
    const extra = Object.keys(params).filter((k) => !documented.includes(k))
    if (extra.length > 0) throw new Error(`undocumented query parameter(s): ${extra.join(', ')}`)
    const limit = params['limit'] ?? PAYSAFE_DEFAULT
    const offset = params['offset'] ?? PAYSAFE_OFFSET_DEFAULT
    if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > PAYSAFE_MAX) {
      throw new Error(`limit must be an integer in 1..${PAYSAFE_MAX} (got ${String(limit)})`)
    }
    if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 0) {
      throw new Error(`offset must be an integer >= 0 (got ${String(offset)})`)
    }
    const rows = all.slice(offset, offset + limit)
    return { data: { [key]: rows, meta: { numberOfRecords: rows.length, limit } } }
  })
  const post = vi.fn()
  const create = vi.spyOn(axios, 'create').mockReturnValue({ get, post } as never)
  return { get, post, create }
}

/** What each request asked for, with Paysafe's documented defaults filled in. */
function sent(get: ReturnType<typeof fakePaysafe>['get']) {
  return get.mock.calls.map((c) => {
    const p = c[1]?.params ?? {}
    return { limit: p['limit'] ?? PAYSAFE_DEFAULT, offset: p['offset'] ?? PAYSAFE_OFFSET_DEFAULT }
  })
}

function ids(start: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => String(start + i))
}

type Row = { id: string }

const METHODS = [
  {
    name: 'listCharges',
    path: '/paymenthub/v1/payments',
    key: 'payments',
    call: (a: PaysafeAdapter, p: QueryParams): Promise<Row[]> => a.listCharges(CREDS, p),
  },
  {
    name: 'listRefunds',
    path: '/paymenthub/v1/refunds',
    key: 'refunds',
    call: (a: PaysafeAdapter, p: QueryParams): Promise<Row[]> => a.listRefunds(CREDS, p),
  },
  {
    name: 'listPlans',
    path: '/subscriptionsplans/v1/plans',
    key: 'plans',
    call: (a: PaysafeAdapter, p: QueryParams): Promise<Row[]> => a.listPlans(CREDS, p),
  },
  {
    name: 'listSubscriptions',
    path: '/subscriptionsplans/v1/subscriptions',
    key: 'subscriptions',
    call: (a: PaysafeAdapter, p: QueryParams): Promise<Row[]> => a.listSubscriptions(CREDS, p),
  },
] as const

afterEach(() => vi.restoreAllMocks())

describe('paysafe listCustomers', () => {
  it.each([{}, { page: '2', limit: '10' }])(
    'refuses with 501 NOT_SUPPORTED and sends no request (query %o)',
    async (q) => {
      const { get, post, create } = fakePaysafe('/customervault/v1/profiles', 'profiles', 100)
      await expect(
        new PaysafeAdapter().listCustomers(CREDS, parseListQuery(q)),
      ).rejects.toMatchObject({
        statusCode: 501,
        code: 'NOT_SUPPORTED',
        message: expect.stringMatching(/^Paysafe cannot list customers: .*merchantCustomerId/),
      })
      // No request of any verb: no client is even built.
      expect(get).not.toHaveBeenCalled()
      expect(post).not.toHaveBeenCalled()
      expect(create).not.toHaveBeenCalled()
    },
  )
})

describe('paysafe capabilities', () => {
  it('declares the documented maximum limit (50) so the sync worker never asks for more', () => {
    expect(new PaysafeAdapter().capabilities).toEqual(
      expect.objectContaining({ maxPageSize: PAYSAFE_MAX }),
    )
  })
})

describe.each(METHODS)('paysafe $name paging', ({ path, key, call }) => {
  const adapter = () => new PaysafeAdapter()
  const run = async (query: Record<string, string>) =>
    (await call(adapter(), parseListQuery(query))).map((r) => r.id)
  /** Params at a page the router never sends, as a direct caller builds them. */
  const runAt = async (page: number) => {
    const params = parseListQuery({ limit: '10' })
    params.page = page
    return (await call(adapter(), params)).map((r) => r.id)
  }

  it('page 1 returns the first rows (offset 0)', async () => {
    const { get } = fakePaysafe(path, key, N_ROWS)
    expect(await run({ page: '1', limit: '10' })).toEqual(ids(1, 10))
    expect(sent(get)).toEqual([{ limit: 10, offset: 0 }])
  })

  it('page 2 returns the next rows (offset 10)', async () => {
    const { get } = fakePaysafe(path, key, N_ROWS)
    expect(await run({ page: '2', limit: '10' })).toEqual(ids(11, 10))
    expect(sent(get)).toEqual([{ limit: 10, offset: 10 }])
  })

  it('a missing page returns the first rows', async () => {
    const { get } = fakePaysafe(path, key, N_ROWS)
    expect(await run({ limit: '10' })).toEqual(ids(1, 10))
    expect(sent(get)).toEqual([{ limit: 10, offset: 0 }])
  })

  // parseListQuery reads 0, -3 and non-numbers as the first page before an
  // adapter sees them, so this guard is for direct callers: built directly.
  it.each([0, -3])('a direct page %s is treated as page 1', async (page) => {
    const { get } = fakePaysafe(path, key, N_ROWS)
    expect(await runAt(page)).toEqual(ids(1, 10))
    expect(sent(get)).toEqual([{ limit: 10, offset: 0 }])
  })

  it('a limit above the documented max (50) is clamped, and page 2 strides by the clamp', async () => {
    const { get } = fakePaysafe(path, key, N_ROWS)
    expect(await run({ page: '1', limit: '500' })).toEqual(ids(1, 50))
    expect(await run({ page: '2', limit: '500' })).toEqual(ids(51, 50))
    expect(sent(get)).toEqual([
      { limit: 50, offset: 0 },
      { limit: 50, offset: 50 },
    ])
  })

  it("a direct call with no params keeps the adapter's own default size", async () => {
    const { get } = fakePaysafe(path, key, N_ROWS)
    expect((await call(adapter(), {})).map((r) => r.id)).toEqual(ids(1, ADAPTER_DEFAULT))
    expect(sent(get)).toEqual([{ limit: ADAPTER_DEFAULT, offset: 0 }])
  })

  it("a direct call with no limit keeps the adapter's own default size", async () => {
    const { get } = fakePaysafe(path, key, N_ROWS)
    expect((await call(adapter(), { page: 2 })).map((r) => r.id)).toEqual(
      ids(ADAPTER_DEFAULT + 1, ADAPTER_DEFAULT),
    )
    expect(sent(get)).toEqual([{ limit: ADAPTER_DEFAULT, offset: ADAPTER_DEFAULT }])
  })

  it.each([10, 7, PAYSAFE_MAX])(
    'walking pages like the sync worker (limit %i, N = 2L + 1) returns every row once, in order',
    async (L) => {
      const n = 2 * L + 1
      fakePaysafe(path, key, n)
      const a = adapter()
      const got: string[] = []
      for (let k = 1; k <= n + 1; k++) {
        const rows = await call(a, withPageSink({ page: k, limit: L }))
        got.push(...rows.map((r) => r.id))
        if (rows.length < L) break
      }
      expect(got).toEqual(ids(1, n))
    },
  )
})

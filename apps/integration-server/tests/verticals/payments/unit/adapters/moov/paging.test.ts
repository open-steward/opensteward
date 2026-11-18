/**
 * Moov paging: listCharges / listPayouts walk GET /accounts/{accountID}/transfers.
 *
 * https://docs.moov.io/api/money-movement/transfers/list/: "When you run this
 * request, you retrieve 200 transfers at a time. You can advance past a results
 * set of 200 transfers by using the skip parameter (for example, if you set
 * skip = 10, you will see a results set of 200 transfers after the first 10)."
 * and "count integer <int64> Page size. When omitted, the server defaults to 200."
 *
 * Charges and payouts are rails of one transfer list that Moov cannot filter
 * by (no documented direction or payment-method-type filter), so the adapter
 * walks upstream pages of 200 by `skip` and cuts the caller's page out of the
 * matching rows. The fake honours only `skip` and `count`.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { _resetRowPager, readUpstreamPage, withPageSink } from '@opensteward/shared'
import { MoovAdapter } from '../../../../../../src/verticals/payments/adapters/moov/index'
import { installFakeMoov, type FakeMoov } from './fake'
import { MERCHANT, transferOf } from './fixtures'

const FIELDS = { publicKey: 'pub', privateKey: 'priv', accountID: MERCHANT }
const RAILS = ['charge', 'payout', 'other', 'charge', 'other'] as const

/** 523 transfers: 3 upstream pages of 200, 200, 123. */
const TRANSFERS = Array.from({ length: 523 }, (_, i) =>
  transferOf(`t-${i}`, RAILS[i % RAILS.length]!),
)
const idsOf = (rail: string) =>
  TRANSFERS.filter((_, i) => RAILS[i % RAILS.length] === rail).map((t) => t['transferID'])

describe.each([
  ['listCharges', 'charge'],
  ['listPayouts', 'payout'],
] as const)('Moov %s paging', (method, rail) => {
  const adapter = new MoovAdapter()
  let fake: FakeMoov
  let creds: Awaited<ReturnType<MoovAdapter['exchangeCredentials']>>

  beforeEach(async () => {
    _resetRowPager()
    fake = installFakeMoov({
      accountID: MERCHANT,
      publicKey: 'pub',
      privateKey: 'priv',
      transfers: TRANSFERS,
    })
    creds = await adapter.exchangeCredentials(FIELDS)
  })
  afterEach(() => fake.restore())

  it.each([7, 50, 500])(
    'walks every %s-row page once, in order, and ends exactly',
    async (limit) => {
      const seen: unknown[] = []
      for (let page = 1; page < 1000; page++) {
        const params = withPageSink({ page, limit })
        const rows = await adapter[method](creds, params)
        seen.push(...rows.map((r) => r.id))
        const meta = readUpstreamPage(params)
        expect(meta?.pagedLocally).toBe(true)
        if (!meta?.hasMore) break
        expect(rows).toHaveLength(limit)
      }
      expect(seen).toEqual(idsOf(rail))
      // Every upstream request asked for a documented page of 200 at a row offset.
      for (const r of fake.requests) {
        expect(r.params['count']).toBe(200)
        expect(Number(r.params['skip']) % 200).toBe(0)
      }
      expect(new Set(fake.requests.map((r) => r.params['skip']))).toEqual(new Set([0, 200, 400]))
    },
  )

  it('serves page 3 directly, starting at the right row', async () => {
    const rows = await adapter[method](creds, { page: 3, limit: 10 })
    expect(rows.map((r) => r.id)).toEqual(idsOf(rail).slice(20, 30))
  })

  it('serves an empty page past the end', async () => {
    const params = withPageSink({ page: 100, limit: 10 })
    expect(await adapter[method](creds, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })
})

describe('Moov charges and payouts do not share a walk', () => {
  it('serves payouts page 2 after charges page 1 from payout rows', async () => {
    _resetRowPager()
    const fake = installFakeMoov({
      accountID: MERCHANT,
      publicKey: 'pub',
      privateKey: 'priv',
      transfers: TRANSFERS,
    })
    try {
      const adapter = new MoovAdapter()
      const creds = await adapter.exchangeCredentials(FIELDS)
      await adapter.listCharges(creds, { page: 1, limit: 10 })
      const payouts = await adapter.listPayouts(creds, { page: 2, limit: 10 })
      expect(payouts.map((p) => p.id)).toEqual(idsOf('payout').slice(10, 20))
    } finally {
      fake.restore()
    }
  })
})

describe('Moov paging on an exact multiple of 200', () => {
  it('ends on the empty page that follows a full last page', async () => {
    _resetRowPager()
    const transfers = Array.from({ length: 200 }, (_, i) => transferOf(`c-${i}`, 'charge'))
    const fake = installFakeMoov({
      accountID: MERCHANT,
      publicKey: 'pub',
      privateKey: 'priv',
      transfers,
    })
    try {
      const adapter = new MoovAdapter()
      const creds = await adapter.exchangeCredentials(FIELDS)
      const params = withPageSink({ page: 1, limit: 200 })
      const rows = await adapter.listCharges(creds, params)
      expect(rows).toHaveLength(200)
      expect(readUpstreamPage(params)?.hasMore).toBe(false)
      expect(fake.requests.map((r) => r.params['skip'])).toEqual([0, 200])
    } finally {
      fake.restore()
    }
  })
})

describe('Moov paging defaults and bounds', () => {
  afterEach(() => _resetRowPager())

  it('serves the default page of 100 when the caller gives no limit', async () => {
    _resetRowPager()
    const fake = installFakeMoov({
      accountID: MERCHANT,
      publicKey: 'pub',
      privateKey: 'priv',
      transfers: TRANSFERS,
    })
    try {
      const adapter = new MoovAdapter()
      const creds = await adapter.exchangeCredentials(FIELDS)
      const rows = await adapter.listCharges(creds, { page: 1 })
      expect(rows.map((r) => r.id)).toEqual(idsOf('charge').slice(0, 100))
    } finally {
      fake.restore()
    }
  })

  it('stops after 50 upstream pages (10,000 transfers) for one caller page', async () => {
    _resetRowPager()
    // 51 full upstream pages of payouts: no charge anywhere in the first 10,000.
    const transfers = Array.from({ length: 51 * 200 }, (_, i) => transferOf(`p-${i}`, 'payout'))
    const fake = installFakeMoov({
      accountID: MERCHANT,
      publicKey: 'pub',
      privateKey: 'priv',
      transfers,
    })
    try {
      const adapter = new MoovAdapter()
      const creds = await adapter.exchangeCredentials(FIELDS)
      await expect(adapter.listCharges(creds, { page: 1, limit: 10 })).rejects.toThrow(
        /more than 50 upstream pages/,
      )
      expect(fake.requests).toHaveLength(50)
    } finally {
      fake.restore()
    }
  })

  it('does not share a walk between two key pairs on the same account', async () => {
    _resetRowPager()
    const adapter = new MoovAdapter()
    const a = installFakeMoov({
      accountID: MERCHANT,
      publicKey: 'pub',
      privateKey: 'priv',
      transfers: TRANSFERS,
    })
    try {
      const credsA = await adapter.exchangeCredentials(FIELDS)
      await adapter.listCharges(credsA, { page: 3, limit: 50 })
    } finally {
      a.restore()
    }
    const b = installFakeMoov({
      accountID: MERCHANT,
      publicKey: 'pub2',
      privateKey: 'priv2',
      transfers: TRANSFERS,
    })
    try {
      const credsB = await adapter.exchangeCredentials({
        ...FIELDS,
        publicKey: 'pub2',
        privateKey: 'priv2',
      })
      const rows = await adapter.listCharges(credsB, { page: 3, limit: 50 })
      expect(rows.map((r) => r.id)).toEqual(idsOf('charge').slice(100, 150))
      // Key pair B walks from the start itself; it never resumes A's walk.
      expect(b.requests[0]!.params['skip']).toBe(0)
    } finally {
      b.restore()
    }
  })
})

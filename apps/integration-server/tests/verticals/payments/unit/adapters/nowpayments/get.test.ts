/**
 * NOWPayments get-one methods: path, headers and envelope, from the official
 * collection https://documenter.gw.postman.com/api/collections/7907941/2s93JusNJt
 *
 *   GET /v1/payment/:payment_id          x-api-key; body is the payment
 *   GET /v1/payout/:payout_id            refused: crypto withdrawals do not fit the fiat schema
 *   GET /v1/subscriptions/plans/:plan-id x-api-key; {"result":{...}}
 *   GET /v1/sub-partner?id=111&...       Bearer JWT; {"result":[...],"count":N}
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { NowpaymentsAdapter } from '../../../../../../src/verticals/payments/adapters/nowpayments/index'
import { ChargeSchema } from '../../../../../../src/verticals/payments/schema/charge'
import { CustomerSchema } from '../../../../../../src/verticals/payments/schema/customer'
import { PlanSchema } from '../../../../../../src/verticals/payments/schema/plan'

const CREDS: Credentials = {
  accessToken: 'np_key',
  extra: { email: 'owner@example.com', password: 'pw' },
}

interface Seen {
  path: string
  params?: Record<string, unknown>
  headers?: Record<string, string>
}

function fake(routes: Record<string, unknown>) {
  const seen: Seen[] = []
  const get = vi.fn(
    async (
      path: string,
      config?: { params?: Record<string, unknown>; headers?: Record<string, string> },
    ) => {
      seen.push({ path, params: config?.params, headers: config?.headers })
      if (!(path in routes))
        throw Object.assign(new Error(`404 ${path}`), { response: { status: 404 } })
      return { data: routes[path] }
    },
  )
  const post = vi.fn(async (path: string) => {
    if (path !== '/auth') throw new Error(`unexpected POST ${path}`)
    return { data: { token: 'jwt-token-1' } }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, post } as never)
  return { seen, post }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('NOWPayments get methods', () => {
  it('getCharge reads GET /payment/:payment_id with x-api-key', async () => {
    const { seen } = fake({
      '/payment/6249365965': {
        payment_id: 6249365965,
        invoice_id: null,
        payment_status: 'finished',
        price_amount: 1,
        price_currency: 'usd',
        pay_amount: 11.8,
        actually_paid: 12,
        pay_currency: 'trx',
        created_at: '2023-07-28T15:06:09.932Z',
        updated_at: '2023-07-28T15:09:40.535Z',
      },
    })
    const c = await new NowpaymentsAdapter().getCharge(CREDS, '6249365965')
    expect(ChargeSchema.parse(c).id).toBe('6249365965')
    expect(c.amount).toBe(100)
    expect(seen).toEqual([
      { path: '/payment/6249365965', params: undefined, headers: { 'x-api-key': 'np_key' } },
    ])
  })

  // "Get payout status" answers the batch with crypto withdrawals,
  // {"withdrawals":[{ ... "currency": "trx", "amount": "100" ... }]}; a ticker
  // is not an ISO 4217 code, so getPayout refuses rather than invent one.
  it('getPayout refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    const { seen, post } = fake({
      '/payout/5000248325': {
        id: '5000145498',
        createdAt: '2020-11-12T17:06:12.791Z',
        withdrawals: [{ id: '5000248325', status: 'FINISHED', currency: 'trx', amount: '100' }],
      },
    })
    await expect(new NowpaymentsAdapter().getPayout(CREDS, '5000248325')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringMatching(/^NOWPayments cannot read a payout: .*crypto/),
    })
    expect(seen).toEqual([])
    expect(post).not.toHaveBeenCalled()
    expect(axios.create).not.toHaveBeenCalled()
  })

  it('getPlan reads the {"result":{...}} envelope', async () => {
    fake({
      '/subscriptions/plans/76215585': {
        result: {
          id: '76215585',
          title: 'test plan',
          interval_day: '1',
          ipn_callback_url: null,
          success_url: null,
          cancel_url: null,
          partially_paid_url: null,
          amount: 2,
          currency: 'USD',
          created_at: '2022-10-04T16:10:06.214Z',
          updated_at: '2022-10-04T16:10:06.214Z',
        },
      },
    })
    const p = await new NowpaymentsAdapter().getPlan(CREDS, '76215585')
    expect(PlanSchema.parse(p)).toMatchObject({
      id: '76215585',
      amount: 200,
      currency: 'USD',
      interval: 'day',
    })
  })

  it('getCustomer filters GET /sub-partner by id with the JWT only', async () => {
    const { seen, post } = fake({
      '/sub-partner': {
        result: [
          {
            id: '111394288',
            name: 'test',
            created_at: '2022-10-06T16:42:47.352Z',
            updated_at: '2022-10-06T16:42:47.352Z',
          },
        ],
        count: 1,
      },
    })
    const c = await new NowpaymentsAdapter().getCustomer(CREDS, '111394288')
    expect(CustomerSchema.parse(c)).toMatchObject({ id: '111394288', name: 'test' })
    expect(post).toHaveBeenCalledTimes(1)
    expect(seen).toEqual([
      {
        path: '/sub-partner',
        params: { id: '111394288' },
        headers: { Authorization: 'Bearer jwt-token-1' },
      },
    ])
  })

  it('getCustomer throws 404 when no row has that id', async () => {
    fake({ '/sub-partner': { result: [{ id: '1', name: 'x' }], count: 1 } })
    await expect(new NowpaymentsAdapter().getCustomer(CREDS, '2')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

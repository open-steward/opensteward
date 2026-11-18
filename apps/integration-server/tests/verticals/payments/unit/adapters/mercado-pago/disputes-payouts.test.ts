/**
 * Mercado Pago disputes (chargebacks) and payouts.
 *
 * GET /v1/chargebacks/search: "This endpoint allows you to search for all
 * chargeback cases associated with a `payment_id`" (required); there is no
 * account-wide chargeback list, so listDisputes refuses.
 * https://www.mercadopago.com.br/developers/en/reference/online-payments/checkout-api-payments/chargebacks/search-chargebacks/get.md
 *
 * Payouts API: no collection read, only GET /v1/payouts/{payout_id}, whose
 * response documents no amount or currency.
 * https://www.mercadopago.com.br/developers/en/reference/online-payments/payouts/overview.md
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { withPageSink } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { MercadoPagoAdapter } from '../../../../../../src/verticals/payments/adapters/mercado-pago'
import { DisputeSchema } from '../../../../../../src/verticals/payments/schema/dispute'

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }))

vi.mock('../../../../../../src/verticals/payments/adapters/mercado-pago/client', () => ({
  MercadoPagoClient: class {
    get = getMock
    post = vi.fn()
  },
}))

const adapter = new MercadoPagoAdapter()
const CREDS: Credentials = { accessToken: 'APP_USR-disputes' }
const PAYMENT_ID = 987654321

/** The documented get-chargeback response example shape. */
function caseRow(i: number) {
  return {
    id: String(123456000 + i),
    payments: [PAYMENT_ID],
    currency: 'BRL',
    amount: '50.00',
    reason: 'unauthorized',
    reason_id: '6',
    documentation_status: 'pending',
    date_created: '2024-02-01T10:30:00.000-03:00',
    date_last_updated: '2024-02-03T14:00:00.000-03:00',
  }
}

beforeEach(() => {
  getMock.mockReset()
})

describe('MercadoPagoAdapter.listDisputes', () => {
  it('refuses every call with 501 NOT_SUPPORTED and sends no request', async () => {
    for (const params of [
      { page: 1, limit: 10 },
      { page: 1, limit: 10, payment_id: String(PAYMENT_ID) },
    ]) {
      await expect(adapter.listDisputes(CREDS, withPageSink(params))).rejects.toMatchObject({
        statusCode: 501,
        code: 'NOT_SUPPORTED',
      })
    }
    expect(getMock).not.toHaveBeenCalled()
  })
})

describe('MercadoPagoAdapter.getDispute', () => {
  it('reads GET /v1/chargebacks/{id} and parses the documented case', async () => {
    // /users/me first (the X-Caller-Id lookup, see caller-id.test.ts), then the case.
    getMock.mockResolvedValueOnce({ id: 2320007493 }).mockResolvedValueOnce(caseRow(1))
    const d = await adapter.getDispute(CREDS, '123456001')
    expect(getMock).toHaveBeenLastCalledWith('/v1/chargebacks/123456001', undefined, {
      'X-Caller-Id': '2320007493',
    })
    expect(DisputeSchema.parse(d).id).toBe('123456001')
    expect(d.chargeId).toBe(String(PAYMENT_ID))
    expect(d.amount).toBe(5000)
  })
})

describe('MercadoPagoAdapter payouts', () => {
  it('listPayouts refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    await expect(
      adapter.listPayouts(CREDS, withPageSink({ page: 1, limit: 10 })),
    ).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(getMock).not.toHaveBeenCalled()
  })

  it('getPayout refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    await expect(adapter.getPayout(CREDS, 'po-1')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(getMock).not.toHaveBeenCalled()
  })
})

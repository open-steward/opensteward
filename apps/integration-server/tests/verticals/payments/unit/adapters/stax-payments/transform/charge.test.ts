/**
 * Fixtures: the documented GET /transaction/{id} response examples,
 * https://docs.staxpayments.com/reference/get-a-transactions-information
 * (the first has "currency": "USD"; the second has "currency": null and
 * "status": "SUCCESS").
 */
import { describe, it, expect } from 'vitest'
import { transformCharge } from '../../../../../../../src/verticals/payments/adapters/stax-payments/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

export const DOC_TXN_1 = {
  id: '6f49149d-69a1-48e6-bec5-d63eb5816118',
  invoice_id: '',
  reference_id: '',
  type: 'charge',
  customer_id: 'd45ee88c-8b27-4be8-8d81-77dda1b81826',
  payment_method_id: '129520d1-3844-45fd-a0b1-afb66bcdc74c',
  success: true,
  meta: { tax: 0, subtotal: 2 },
  total: 1,
  method: 'card',
  created_at: '2017-05-17 19:57:08',
  updated_at: '2017-05-17 19:57:08',
  total_refunded: null,
  currency: 'USD',
}

export const DOC_TXN_2 = {
  id: '1f615a4d-23d7-4b84-9400-7a7cf088d39c',
  invoice_id: '9e129e52-44d0-43df-9bcc-e4d5ab20bb38',
  reference_id: '',
  type: 'charge',
  customer_id: 'a32bd442-dfe1-4863-8992-513d671e8d9a',
  payment_method_id: '2717e886-8267-464d-b58e-696b7a857b2e',
  success: true,
  total: 42,
  created_at: '2025-05-21 20:26:06',
  updated_at: '2025-05-21 20:26:07',
  currency: null,
  total_refunded: 0,
  status: 'SUCCESS',
}

describe('stax-payments transformCharge', () => {
  it('maps the first documented transaction, converting major to minor units', () => {
    const c = ChargeSchema.parse(transformCharge(DOC_TXN_1, 'USD'))
    expect(c.id).toBe('6f49149d-69a1-48e6-bec5-d63eb5816118')
    expect(c.amount).toBe(100)
    expect(c.currency).toBe('USD')
    expect(c.customerId).toBe('d45ee88c-8b27-4be8-8d81-77dda1b81826')
    expect(c.paymentMethodId).toBe('129520d1-3844-45fd-a0b1-afb66bcdc74c')
    expect(c.invoiceId).toBeUndefined()
    expect(c.amountRefunded).toBeUndefined()
    // No status field on this example: nothing is claimed.
    expect(c.status).toBe('unknown')
    expect(c.createdAt).toBe('2017-05-17T19:57:08.000Z')
  })

  it('maps the second documented transaction with the currency it is given', () => {
    const c = ChargeSchema.parse(transformCharge(DOC_TXN_2, 'USD'))
    expect(c.amount).toBe(4200)
    expect(c.amountRefunded).toBe(0)
    expect(c.status).toBe('succeeded')
    expect(c.invoiceId).toBe('9e129e52-44d0-43df-9bcc-e4d5ab20bb38')
  })

  it('converts total_refunded from major to minor units', () => {
    const c = ChargeSchema.parse(transformCharge({ ...DOC_TXN_2, total_refunded: 12.34 }, 'USD'))
    expect(c.amountRefunded).toBe(1234)
  })

  it('maps the documented status filter values', () => {
    expect(transformCharge({ ...DOC_TXN_2, status: 'FAILED' }, 'USD').status).toBe('failed')
    expect(transformCharge({ ...DOC_TXN_2, status: 'PENDING' }, 'USD').status).toBe('pending')
    expect(transformCharge({ ...DOC_TXN_2, status: 'OTHER' }, 'USD').status).toBe('unknown')
  })

  it('throws on a transaction without a total rather than reporting 0', () => {
    expect(() => transformCharge({ ...DOC_TXN_2, total: null }, 'USD')).toThrow(/has no total/)
  })
})

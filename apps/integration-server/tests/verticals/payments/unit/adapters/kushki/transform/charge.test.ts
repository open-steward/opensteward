import { describe, it, expect } from 'vitest'
import { transformCharge } from '../../../../../../../src/verticals/payments/adapters/kushki/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'
import { APPROVED_SALE } from '../fixtures'

describe('kushki transformCharge (transactions-list SALE row)', () => {
  it('maps the documented approved SALE example', () => {
    const c = ChargeSchema.parse(transformCharge(APPROVED_SALE))
    expect(c.id).toBe('029184246439606168')
    expect(c.externalId).toBe('029184246439606168')
    // request_amount 1000 MXN, a 2-decimal currency
    expect(c.amount).toBe(100000)
    expect(c.amountCaptured).toBe(100000)
    expect(c.currency).toBe('MXN')
    expect(c.status).toBe('succeeded')
    expect(c.failureCode).toBeUndefined()
    expect(c.createdAt).toBe('2025-02-04T15:55:37.000Z')
    expect(c.metadata).toEqual({ contractID: '157AB' })
    expect(c.gateway).toBe('kushki')
  })

  it('reports a declined row as failed with the processor response', () => {
    const c = ChargeSchema.parse(
      transformCharge({
        ...APPROVED_SALE,
        transaction_status: 'DECLINED',
        approved_transaction_amount: 0,
        response_code: 'K220',
        response_text: 'Monto de la transacción es diferente al monto de la venta inicial',
      }),
    )
    expect(c.status).toBe('failed')
    expect(c.amountCaptured).toBe(0)
    expect(c.failureCode).toBe('K220')
    expect(c.failureMessage).toMatch(/^Monto/)
  })

  it('maps INITIALIZED to pending and an undocumented status to unknown', () => {
    expect(transformCharge({ ...APPROVED_SALE, transaction_status: 'INITIALIZED' }).status).toBe(
      'pending',
    )
    expect(transformCharge({ ...APPROVED_SALE, transaction_status: 'NEW' }).status).toBe('unknown')
  })

  it('maps the overview and query-param spelling APPROVAL to succeeded', () => {
    expect(transformCharge({ ...APPROVED_SALE, transaction_status: 'APPROVAL' }).status).toBe(
      'succeeded',
    )
  })

  it('takes amount from request_amount and amountCaptured from approved_transaction_amount', () => {
    const c = ChargeSchema.parse(
      transformCharge({ ...APPROVED_SALE, request_amount: 1000, approved_transaction_amount: 600 }),
    )
    expect(c.amount).toBe(100000)
    expect(c.amountCaptured).toBe(60000)
  })

  it('maps the documented subscription_id and payment_description', () => {
    const c = transformCharge({
      ...APPROVED_SALE,
      subscription_id: '1574693127852000',
      payment_description: 'Pago de prueba',
    })
    expect(c.subscriptionId).toBe('1574693127852000')
    expect(c.description).toBe('Pago de prueba')
  })

  it("reads the overview's millisecond `created` form", () => {
    const c = transformCharge({ ...APPROVED_SALE, created: 1748476800000 })
    expect(c.createdAt).toBe('2025-05-29T00:00:00.000Z')
  })

  it('throws rather than inventing an id, currency or amount', () => {
    expect(() => transformCharge({ ...APPROVED_SALE, ticket_number: '' })).toThrow(/ticket_number/)
    expect(() => transformCharge({ ...APPROVED_SALE, currency_code: undefined })).toThrow(
      /currency_code/,
    )
    expect(() => transformCharge({ ...APPROVED_SALE, request_amount: undefined })).toThrow(
      /request_amount/,
    )
  })
})

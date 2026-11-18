import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawMolliePayment,
} from '../../../../../../../src/verticals/payments/adapters/mollie/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('mollie transformCharge', () => {
  it('maps a paid payment to succeeded with decimal-to-minor conversion', () => {
    const raw: RawMolliePayment = {
      id: 'tr_abc',
      status: 'paid',
      amount: { value: '25.00', currency: 'EUR' },
      amountRefunded: { value: '0.00', currency: 'EUR' },
      description: 'Order #42',
      customerId: 'cst_mollie1',
      mandateId: 'mdt_1',
      subscriptionId: 'sub_1',
      createdAt: '2023-11-01T00:00:00+00:00',
      metadata: { ref: 'order-42' },
    }
    const result = transformCharge(raw)

    expect(result.id).toBe('tr_abc')
    expect(result.amount).toBe(2500)
    expect(result.currency).toBe('EUR')
    expect(result.status).toBe('succeeded')
    expect(result.customerId).toBe('cst_mollie1')
    expect(result.subscriptionId).toBe('sub_1')
    expect(result.gateway).toBe('mollie')
    expect(result.metadata.ref).toBe('order-42')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a failed/expired payment to failed status', () => {
    const raw: RawMolliePayment = {
      id: 'tr_fail',
      status: 'expired',
      amount: { value: '10.00', currency: 'EUR' },
      createdAt: '2023-11-01T00:00:00+00:00',
    }
    const result = transformCharge(raw)

    expect(result.status).toBe('failed')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a canceled payment to cancelled status', () => {
    const raw: RawMolliePayment = {
      id: 'tr_cancel',
      status: 'canceled',
      amount: { value: '5.00', currency: 'USD' },
      createdAt: '2023-11-01T00:00:00+00:00',
    }
    const result = transformCharge(raw)

    expect(result.status).toBe('cancelled')
    expect(result.currency).toBe('USD')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})

import { describe, it, expect } from 'vitest'
import {
  transformDispute,
  type RawMollieChargeback,
} from '../../../../../../../src/verticals/payments/adapters/mollie/transform/dispute'
import { DisputeSchema } from '../../../../../../../src/verticals/payments/schema/dispute'

describe('mollie transformDispute', () => {
  it('maps an open chargeback with fraud reason to needs_response status', () => {
    const raw: RawMollieChargeback = {
      id: 'chb_1',
      paymentId: 'tr_abc',
      amount: { value: '50.00', currency: 'EUR' },
      settlementAmount: { value: '-50.00', currency: 'EUR' },
      reason: { code: 'FR01', description: 'Fraudulent Transaction' },
      createdAt: '2023-11-01T00:00:00+00:00',
    }
    const result = transformDispute(raw)

    expect(result.id).toBe('chb_1')
    expect(result.chargeId).toBe('tr_abc')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('EUR')
    expect(result.status).toBe('needs_response')
    expect(result.reason).toBe('fraudulent')
    expect(result.gateway).toBe('mollie')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps a reversed chargeback to won status', () => {
    const raw: RawMollieChargeback = {
      id: 'chb_2',
      paymentId: 'tr_def',
      amount: { value: '30.00', currency: 'EUR' },
      createdAt: '2023-11-01T00:00:00+00:00',
      reversedAt: '2023-11-05T00:00:00+00:00',
    }
    const result = transformDispute(raw)

    expect(result.status).toBe('won')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps NOT_RECEIVED reason code to product_not_received', () => {
    const raw: RawMollieChargeback = {
      id: 'chb_3',
      paymentId: 'tr_ghi',
      amount: { value: '20.00', currency: 'EUR' },
      reason: { code: 'NOT_RECEIVED', description: 'Item not received' },
      createdAt: '2023-11-01T00:00:00+00:00',
    }
    const result = transformDispute(raw)

    expect(result.reason).toBe('product_not_received')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })
})

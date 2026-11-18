import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  untransformCharge,
  type RawIxopayTransaction,
} from '../../../../../../../src/verticals/payments/adapters/ixopay/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('ixopay transformCharge', () => {
  it('maps transactionStatus FINISHED to "succeeded" and converts major-unit amount', () => {
    const raw: RawIxopayTransaction = {
      uuid: 'ixo-uuid-001',
      transactionStatus: 'FINISHED',
      amount: '49.99',
      currency: 'EUR',
      customer: { identification: 'cust-1', email: 'user@example.com' },
      returnData: { createdAt: '2024-03-01T00:00:00Z' },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(4999)
    expect(result.currency).toBe('EUR')
    expect(result.gateway).toBe('ixopay')
    expect(result.customerId).toBe('cust-1')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps transactionStatus PENDING to "pending"', () => {
    const raw: RawIxopayTransaction = {
      uuid: 'ixo-uuid-002',
      transactionStatus: 'PENDING',
      amount: '10.00',
      currency: 'USD',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(result.currency).toBe('USD')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps transactionStatus ERROR to "failed" and sets failure fields', () => {
    const raw: RawIxopayTransaction = {
      uuid: 'ixo-uuid-003',
      transactionStatus: 'ERROR',
      amount: '5.00',
      currency: 'GBP',
      errors: [{ code: 'E001', adapterMessage: 'Card declined', message: 'declined' }],
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(result.failureCode).toBe('E001')
    expect(result.failureMessage).toBe('Card declined')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps transactionStatus CHARGEBACK to "disputed"', () => {
    const raw: RawIxopayTransaction = {
      uuid: 'ixo-uuid-004',
      transactionStatus: 'CHARGEBACK',
      amount: '20.00',
      currency: 'EUR',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('disputed')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps PARTIALLY-REFUNDED transactionStatus to "partially_refunded"', () => {
    const raw: RawIxopayTransaction = {
      uuid: 'ixo-uuid-005',
      transactionStatus: 'PARTIALLY-REFUNDED',
      amount: '30.00',
      currency: 'EUR',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('partially_refunded')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('falls back to returnType when no transactionStatus', () => {
    const raw: RawIxopayTransaction = {
      uuid: 'ixo-uuid-006',
      returnType: 'FINISHED',
      success: true,
      amount: '15.00',
      currency: 'USD',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('round-trips through untransformCharge', () => {
    const raw: RawIxopayTransaction = {
      uuid: 'ixo-rt-001',
      transactionStatus: 'FINISHED',
      amount: '25.00',
      currency: 'USD',
      customer: { identification: 'cust-rt' },
    }
    const charge = transformCharge(raw)
    const back = untransformCharge(charge)
    expect(back.amount).toBe('25.00')
    expect(back.currency).toBe('USD')
    expect((back.customer as Record<string, unknown>)?.identification).toBe('cust-rt')
  })
})

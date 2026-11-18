import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawTipaltiPayment,
} from '../../../../../../../src/verticals/payments/adapters/tipalti/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('tipalti transformCharge', () => {
  it('maps a PAID payment to status succeeded', () => {
    const raw: RawTipaltiPayment = {
      id: 'pay-001',
      refCode: 'REF-001',
      payeeId: 'payee-abc',
      status: 'PAID',
      paymentMethod: 'ACH',
      amountSubmitted: { amount: 125.0, currency: 'USD' },
      submissionDate: '2024-03-01T00:00:00Z',
      transactionCompletionDate: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('pay-001')
    expect(result.externalId).toBe('REF-001')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(12500)
    expect(result.currency).toBe('USD')
    expect(result.customerId).toBe('payee-abc')
    expect(result.gateway).toBe('tipalti')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a REJECTED payment to status failed', () => {
    const raw: RawTipaltiPayment = {
      id: 'pay-002',
      refCode: 'REF-002',
      status: 'REJECTED',
      amountSubmitted: { amount: 50.0, currency: 'EUR' },
      submissionDate: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(result.currency).toBe('EUR')
    expect(result.amount).toBe(5000)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a SCHEDULED payment to status pending', () => {
    const raw: RawTipaltiPayment = {
      id: 'pay-003',
      status: 'SCHEDULED',
      amountSubmitted: { amount: 200.0, currency: 'GBP' },
      scheduledDate: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(result.currency).toBe('GBP')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a CANCELED payment to status cancelled', () => {
    const raw: RawTipaltiPayment = {
      id: 'pay-004',
      status: 'CANCELED',
      amountSubmitted: { amount: 75.5, currency: 'USD' },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})

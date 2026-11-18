import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawApsCharge,
} from '../../../../../../../src/verticals/payments/adapters/amazon-payment-services/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('amazon-payment-services transformCharge', () => {
  it('maps a purchase success (status 14) to succeeded and marks captured', () => {
    const raw: RawApsCharge = {
      fort_id: 'FT-001',
      merchant_reference: 'MR-001',
      status: '14',
      amount: '10000',
      currency: 'AED',
      customer_email: 'buyer@example.com',
      response_code: '14000',
    }
    const result = transformCharge(raw)

    expect(result.id).toBe('FT-001')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(10000)
    expect(result.currency).toBe('AED')
    expect(result.captured).toBe(true)
    expect(result.receiptEmail).toBe('buyer@example.com')
    expect(result.gateway).toBe('amazon-payment-services')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a capture success (status 04) to succeeded', () => {
    const raw: RawApsCharge = {
      fort_id: 'FT-002',
      status: '04',
      amount: '5000',
      currency: 'USD',
    }
    const result = transformCharge(raw)

    expect(result.status).toBe('succeeded')
    expect(result.captured).toBe(true)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a voided authorization (status 08) to cancelled', () => {
    const raw: RawApsCharge = {
      fort_id: 'FT-003',
      status: '08',
      amount: '3000',
      currency: 'EUR',
    }
    const result = transformCharge(raw)

    expect(result.status).toBe('cancelled')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps an unknown status with non-success response_code to failed', () => {
    const raw: RawApsCharge = {
      fort_id: 'FT-004',
      status: '99',
      response_code: '99123',
      response_message: 'Card declined',
      amount: '2000',
      currency: 'GBP',
    }
    const result = transformCharge(raw)

    expect(result.status).toBe('failed')
    expect(result.failureCode).toBe('99123')
    expect(result.failureMessage).toBe('Card declined')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps authorization success (status 02) to succeeded', () => {
    const raw: RawApsCharge = {
      fort_id: 'FT-005',
      status: '02',
      amount: '7500',
      currency: 'SAR',
    }
    const result = transformCharge(raw)

    expect(result.status).toBe('succeeded')
    expect(result.captured).toBeUndefined()
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})

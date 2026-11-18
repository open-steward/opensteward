import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawAmazonPayCharge,
} from '../../../../../../../src/verticals/payments/adapters/amazon-pay/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('amazon-pay transformCharge', () => {
  it('maps a Captured charge to succeeded status', () => {
    const raw: RawAmazonPayCharge = {
      chargeId: 'C01',
      chargePermissionId: 'P01',
      chargeAmount: { amount: '14.00', currencyCode: 'USD' },
      captureAmount: { amount: '14.00', currencyCode: 'USD' },
      statusDetails: {
        state: 'Captured',
        lastUpdatedTimestamp: '2024-03-01T00:00:00Z',
      },
      creationTimestamp: '2024-03-01T00:00:00Z',
      captureNow: true,
    }
    const result = transformCharge(raw)

    expect(result.id).toBe('C01')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(1400)
    expect(result.currency).toBe('USD')
    expect(result.captured).toBe(true)
    expect(result.customerId).toBe('P01')
    expect(result.gateway).toBe('amazon-pay')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a Declined charge to failed status', () => {
    const raw: RawAmazonPayCharge = {
      chargeId: 'C02',
      chargeAmount: { amount: '50.00', currencyCode: 'EUR' },
      statusDetails: {
        state: 'Declined',
        reasonCode: 'AmazonRejected',
        reasonDescription: 'Amazon declined the payment.',
      },
    }
    const result = transformCharge(raw)

    expect(result.status).toBe('failed')
    expect(result.failureCode).toBe('AmazonRejected')
    expect(result.failureMessage).toBe('Amazon declined the payment.')
    expect(result.currency).toBe('EUR')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a Canceled charge to cancelled status', () => {
    const raw: RawAmazonPayCharge = {
      chargeId: 'C03',
      chargeAmount: { amount: '10.00', currencyCode: 'GBP' },
      statusDetails: { state: 'Canceled' },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps an AuthorizationInitiated charge to pending status', () => {
    const raw: RawAmazonPayCharge = {
      chargeId: 'C04',
      chargeAmount: { amount: '20.00', currencyCode: 'USD' },
      statusDetails: { state: 'AuthorizationInitiated' },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('includes merchant metadata in the metadata map', () => {
    const raw: RawAmazonPayCharge = {
      chargeId: 'C05',
      chargeAmount: { amount: '5.00', currencyCode: 'USD' },
      merchantMetadata: {
        merchantReferenceId: 'REF-123',
        noteToBuyer: 'Thank you',
      },
      statusDetails: { state: 'Captured' },
    }
    const result = transformCharge(raw)
    expect(result.metadata?.merchantReferenceId).toBe('REF-123')
    expect(result.description).toBe('Thank you')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})

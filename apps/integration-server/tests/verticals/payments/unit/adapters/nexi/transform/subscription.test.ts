import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  type RawNexiSubscription,
} from '../../../../../../../src/verticals/payments/adapters/nexi/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

describe('nexi transformSubscription', () => {
  it('maps a subscription with full payment details', () => {
    const raw: RawNexiSubscription = {
      subscriptionId: 'sub-001',
      interval: 30,
      frequency: 1,
      endDate: '2025-03-01T00:00:00Z',
      paymentDetails: {
        paymentType: 'CARD',
        paymentMethod: 'Visa',
        cardDetails: {
          maskedPan: '4111xxxxxxxx1111',
          expiryDate: '12/26',
        },
      },
    }
    const result = transformSubscription(raw)
    expect(result.id).toBe('sub-001')
    expect(result.externalId).toBe('sub-001')
    expect(result.status).toBe('active')
    expect(result.customerId).toBe('')
    expect(result.items).toEqual([])
    expect(result.currentPeriodEnd).toBeDefined()
    expect(result.gateway).toBe('nexi')
    expect(result.metadata['paymentType']).toBe('CARD')
    expect(result.metadata['paymentMethod']).toBe('Visa')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps a minimal subscription without payment details', () => {
    const raw: RawNexiSubscription = {
      subscriptionId: 'sub-002',
      endDate: '2024-12-31',
    }
    const result = transformSubscription(raw)
    expect(result.id).toBe('sub-002')
    expect(result.status).toBe('active')
    expect(result.currency).toBeUndefined()
    expect(result.createdAt).toBeUndefined()
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('handles missing endDate gracefully', () => {
    const raw: RawNexiSubscription = {
      subscriptionId: 'sub-003',
      interval: 7,
      frequency: 4,
    }
    const result = transformSubscription(raw)
    expect(result.currentPeriodEnd).toBeUndefined()
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })
})

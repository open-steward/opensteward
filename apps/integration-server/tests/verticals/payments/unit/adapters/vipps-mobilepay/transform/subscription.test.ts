import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  type RawVippsAgreement,
} from '../../../../../../../src/verticals/payments/adapters/vipps-mobilepay/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

describe('vipps-mobilepay transformSubscription', () => {
  it('maps an ACTIVE agreement to status "active"', () => {
    const raw: RawVippsAgreement = {
      id: 'AGR-001',
      status: 'ACTIVE',
      sub: 'customer-abc',
      pricing: { type: 'LEGACY', amount: 9900, currency: 'NOK' },
      interval: { unit: 'MONTH', count: 1 },
      productName: 'Premium Plan',
      created: '2024-01-01T00:00:00Z',
      start: '2024-01-01T00:00:00Z',
    }
    const result = transformSubscription(raw)
    expect(result.id).toBe('AGR-001')
    expect(result.externalId).toBe('AGR-001')
    expect(result.status).toBe('active')
    expect(result.customerId).toBe('customer-abc')
    expect(result.currency).toBe('NOK')
    expect(result.items).toHaveLength(1)
    expect(result.items[0]!.amount).toBe(9900)
    expect(result.gateway).toBe('vipps-mobilepay')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps a PENDING agreement to status "incomplete"', () => {
    const raw: RawVippsAgreement = {
      id: 'AGR-002',
      status: 'PENDING',
      sub: 'customer-def',
      pricing: { type: 'LEGACY', amount: 4900, currency: 'NOK' },
      interval: { unit: 'MONTH', count: 1 },
      created: '2024-02-01T00:00:00Z',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('incomplete')
    expect(result.items).toHaveLength(1)
    expect(result.items[0]!.amount).toBe(4900)
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps a STOPPED agreement to status "cancelled" with cancelledAt', () => {
    const raw: RawVippsAgreement = {
      id: 'AGR-003',
      status: 'STOPPED',
      sub: 'customer-ghi',
      pricing: { type: 'LEGACY', amount: 19900, currency: 'NOK' },
      interval: { unit: 'YEAR', count: 1 },
      created: '2023-01-01T00:00:00Z',
      start: '2023-01-01T00:00:00Z',
      stop: '2024-01-01T00:00:00Z',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('cancelled')
    expect(result.cancelledAt).toBe('2024-01-01T00:00:00.000Z')
    expect(result.cancelAtPeriodEnd).toBe(false)
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps an EXPIRED agreement to status "expired"', () => {
    const raw: RawVippsAgreement = {
      id: 'AGR-004',
      status: 'EXPIRED',
      sub: 'customer-jkl',
      pricing: { type: 'LEGACY', amount: 2900, currency: 'NOK' },
      interval: { unit: 'WEEK', count: 2 },
      created: '2023-06-01T00:00:00Z',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('expired')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps unknown status to "incomplete"', () => {
    const raw: RawVippsAgreement = {
      id: 'AGR-005',
      status: 'UNKNOWN_STATE',
      sub: 'customer-mno',
      pricing: { type: 'LEGACY', amount: 1000, currency: 'NOK' },
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('incomplete')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('sets currentPeriodStart from start field', () => {
    const raw: RawVippsAgreement = {
      id: 'AGR-006',
      status: 'ACTIVE',
      sub: 'customer-pqr',
      pricing: { amount: 5000, currency: 'NOK' },
      start: '2024-03-15T10:00:00Z',
      created: '2024-03-15T10:00:00Z',
    }
    const result = transformSubscription(raw)
    expect(result.currentPeriodStart).toBe('2024-03-15T10:00:00.000Z')
    expect(result.billingAnchor).toBe('2024-03-15T10:00:00.000Z')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('includes interval and productName in metadata', () => {
    const raw: RawVippsAgreement = {
      id: 'AGR-007',
      status: 'ACTIVE',
      sub: 'customer-stu',
      pricing: { type: 'LEGACY', amount: 7900, currency: 'NOK' },
      interval: { unit: 'MONTH', count: 3 },
      productName: 'Quarterly Plan',
      externalId: 'ext-123',
      merchantAgreementUrl: 'https://merchant.example.com/agreements/AGR-007',
      created: '2024-04-01T00:00:00Z',
    }
    const result = transformSubscription(raw)
    expect(result.metadata?.['intervalUnit']).toBe('MONTH')
    expect(result.metadata?.['intervalCount']).toBe('3')
    expect(result.metadata?.['productName']).toBe('Quarterly Plan')
    expect(result.metadata?.['externalId']).toBe('ext-123')
    expect(result.metadata?.['merchantAgreementUrl']).toBe(
      'https://merchant.example.com/agreements/AGR-007',
    )
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to NOK when pricing currency is missing', () => {
    const raw: RawVippsAgreement = {
      id: 'AGR-008',
      status: 'ACTIVE',
      sub: 'customer-vwx',
      pricing: { amount: 3000 },
    }
    const result = transformSubscription(raw)
    expect(result.currency).toBe('NOK')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })
})

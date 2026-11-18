import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawTrustlyCharge,
} from '../../../../../../../src/verticals/payments/adapters/trustly/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('trustly transformCharge', () => {
  it('maps a settled deposit (succeeded) with amount and currency', () => {
    const raw: RawTrustlyCharge = {
      orderid: 'ORDER_001',
      gluepayid: 'GLUE_001',
      transactiontype: 'deposit',
      amount: '99.50',
      currency: 'EUR',
      enduserid: 'user_001',
      datestamp: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('ORDER_001')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(9950)
    expect(result.currency).toBe('EUR')
    expect(result.customerId).toBe('user_001')
    expect(result.gateway).toBe('trustly')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a pending deposit result (no ledger data yet)', () => {
    const raw: RawTrustlyCharge = {
      orderid: 'ORDER_002',
      url: 'https://checkout.trustly.com/ORDER_002',
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('ORDER_002')
    expect(result.status).toBe('pending')
    expect(result.receiptUrl).toBe('https://checkout.trustly.com/ORDER_002')
    expect(result.amount).toBe(0)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a refunded/reversed charge', () => {
    const raw: RawTrustlyCharge = {
      orderid: 'ORDER_003',
      transactiontype: 'reversal',
      amount: '50.00',
      currency: 'SEK',
      datestamp: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('refunded')
    expect(result.currency).toBe('SEK')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('normalises currency defensively', () => {
    const raw: RawTrustlyCharge = {
      orderid: 'ORDER_004',
      transactiontype: 'credit',
      amount: '10.00',
      currency: 'usd',
      datestamp: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.currency).toBe('USD')
    expect(result.status).toBe('succeeded')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})

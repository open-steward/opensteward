import { describe, it, expect } from 'vitest'
import {
  transformPayout,
  type RawNexiPayout,
} from '../../../../../../../src/verticals/payments/adapters/nexi/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'

describe('nexi transformPayout', () => {
  it('maps a payout to status "paid" with all fields', () => {
    const raw: RawNexiPayout = {
      id: 'payout-001',
      reference: 'REF-001',
      date: '2024-03-01T00:00:00Z',
      bankAccountIban: 'DE89370400440532013000',
      bankAccountBic: 'COBADEFFXXX',
      currency: 'EUR',
      amount: 50000,
      chargedAmount: 55000,
      refundedAmount: 5000,
      fees: 200,
    }
    const result = transformPayout(raw)
    expect(result.id).toBe('payout-001')
    expect(result.externalId).toBe('payout-001')
    expect(result.status).toBe('paid')
    expect(result.amount).toBe(50000)
    expect(result.currency).toBe('EUR')
    expect(result.method).toBe('standard')
    expect(result.statementDescriptor).toBe('REF-001')
    expect(result.gateway).toBe('nexi')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to EUR when absent', () => {
    const raw: RawNexiPayout = {
      id: 'payout-002',
      amount: 10000,
      date: '2024-03-01T00:00:00Z',
    }
    const result = transformPayout(raw)
    expect(result.currency).toBe('EUR')
    expect(result.status).toBe('paid')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('includes IBAN and BIC in metadata', () => {
    const raw: RawNexiPayout = {
      id: 'payout-003',
      currency: 'DKK',
      amount: 20000,
      bankAccountIban: 'DK5000400440116243',
      bankAccountBic: 'NDEADKKK',
      date: '2024-03-01T00:00:00Z',
    }
    const result = transformPayout(raw)
    expect(result.metadata['bankAccountIban']).toBe('DK5000400440116243')
    expect(result.metadata['bankAccountBic']).toBe('NDEADKKK')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })
})

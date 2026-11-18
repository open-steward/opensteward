import { describe, it, expect } from 'vitest'
import {
  transformPayout,
  type RawEbanxPayout,
} from '../../../../../../../src/verticals/payments/adapters/ebanx/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'

describe('ebanx transformPayout', () => {
  it('maps a PA payout to status "paid"', () => {
    const raw: RawEbanxPayout = {
      uid: 'PAYOUT-001',
      external_reference: 'ext-ref-001',
      status: 'PA',
      request_amount: '500.00',
      request_currency: 'BRL',
      request_date: '2024-03-01 00:00:00',
      paid_date: '2024-03-02 10:00:00',
      status_date: '2024-03-02 10:00:00',
      payee: {
        bank_account: {
          account_last_4: '1234',
        },
      },
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('paid')
    expect(result.amount).toBe(50000)
    expect(result.currency).toBe('BRL')
    expect(result.gateway).toBe('ebanx')
    expect(result.id).toBe('PAYOUT-001')
    expect(result.destinationLast4).toBe('1234')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps a PE payout to status "pending"', () => {
    const raw: RawEbanxPayout = {
      uid: 'PAYOUT-002',
      status: 'PE',
      request_amount: '200.00',
      request_currency: 'BRL',
      request_date: '2024-03-01 00:00:00',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('pending')
    expect(result.amount).toBe(20000)
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps an OP payout to status "pending"', () => {
    const raw: RawEbanxPayout = {
      uid: 'PAYOUT-003',
      status: 'OP',
      request_amount: '100.00',
      request_currency: 'USD',
      request_date: '2024-03-01 00:00:00',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('pending')
    expect(result.currency).toBe('USD')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps a CA payout to status "cancelled"', () => {
    const raw: RawEbanxPayout = {
      uid: 'PAYOUT-004',
      status: 'CA',
      request_amount: '300.00',
      request_currency: 'BRL',
      request_date: '2024-03-01 00:00:00',
      cancel_date: '2024-03-01 12:00:00',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('cancelled')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })
})

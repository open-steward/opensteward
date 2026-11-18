import { describe, it, expect } from 'vitest'
import {
  transformPayout,
  type RawDecentroPayout,
} from '../../../../../../../src/verticals/payments/adapters/decentro/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'

describe('decentro transformPayout', () => {
  it('maps a SUCCESS payout to status "paid" with amount from context', () => {
    const raw: RawDecentroPayout = {
      decentro_txn_id: 'DPAY-001',
      reference_id: 'ref-payout-001',
      api_status: 'SUCCESS',
      data: {
        transaction_status: 'SUCCESS',
        beneficiary_name: 'John Doe',
        bank_reference_number: 'BANK-PAY-001',
        transfer_type: 'IMPS',
      },
    }
    const result = transformPayout(raw, { amount: 500 })
    expect(result.id).toBe('DPAY-001')
    expect(result.status).toBe('paid')
    expect(result.amount).toBe(50000)
    expect(result.currency).toBe('INR')
    expect(result.statementDescriptor).toBe('John Doe')
    expect(result.gateway).toBe('decentro')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps a PENDING payout to status "in_transit"', () => {
    const raw: RawDecentroPayout = {
      decentro_txn_id: 'DPAY-002',
      data: {
        transaction_status: 'PENDING',
        transfer_type: 'NEFT',
      },
    }
    const result = transformPayout(raw, { amount: 100 })
    expect(result.status).toBe('in_transit')
    expect(result.amount).toBe(10000)
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps a FAILURE payout to status "failed" with failureCode and failureMessage', () => {
    const raw: RawDecentroPayout = {
      decentro_txn_id: 'DPAY-003',
      response_key: 'BENEFICIARY_INVALID',
      message: 'Beneficiary bank account invalid',
      data: {
        transaction_status: 'FAILURE',
        transaction_status_description: 'Beneficiary bank account invalid',
      },
    }
    const result = transformPayout(raw, { amount: 250 })
    expect(result.status).toBe('failed')
    expect(result.failureCode).toBe('BENEFICIARY_INVALID')
    expect(result.failureMessage).toBe('Beneficiary bank account invalid')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })
})

import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawDecentroCharge,
} from '../../../../../../../src/verticals/payments/adapters/decentro/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('decentro transformCharge', () => {
  it('maps a SUCCESS transaction to status "succeeded" with amount in minor units', () => {
    const raw: RawDecentroCharge = {
      decentro_txn_id: 'DECT-001',
      reference_id: 'ref-001',
      data: {
        transaction_status: 'SUCCESS',
        transaction_amount: 100,
        bank_reference_number: 'BANK-001',
        payer_vpa: 'payer@upi',
        payee_vpa: 'payee@upi',
      },
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('DECT-001')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(10000)
    expect(result.currency).toBe('INR')
    expect(result.gateway).toBe('decentro')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a PENDING transaction to status "pending"', () => {
    const raw: RawDecentroCharge = {
      decentro_txn_id: 'DECT-002',
      data: {
        transaction_status: 'PENDING',
        transaction_amount: 50,
      },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(result.amount).toBe(5000)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a FAILURE transaction to status "failed"', () => {
    const raw: RawDecentroCharge = {
      decentro_txn_id: 'DECT-003',
      error_key: 'PAYMENT_DECLINED',
      data: {
        transaction_status: 'FAILURE',
        transaction_amount: 200,
        transaction_status_description: 'Payment declined by bank',
      },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(result.failureCode).toBe('PAYMENT_DECLINED')
    expect(result.description).toBe('Payment declined by bank')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps camelCase response fields correctly', () => {
    const raw: RawDecentroCharge = {
      decentroTxnId: 'DECT-004',
      data: {
        transactionStatus: 'SUCCESS',
        transactionAmount: 75.5,
      },
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('DECT-004')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(7550)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})

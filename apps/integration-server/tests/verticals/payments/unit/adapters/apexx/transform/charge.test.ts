import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  untransformCharge,
  type RawApexxTransaction,
} from '../../../../../../../src/verticals/payments/adapters/apexx/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('apexx transformCharge', () => {
  it('maps a CAPTURED transaction to succeeded', () => {
    const raw: RawApexxTransaction = {
      _id: 'TX-001',
      transaction_status: 'CAPTURED',
      amount: 2500,
      currency: 'GBP',
      captured_amount: 2500,
      capture_now: true,
      customer_id: 'CUST-001',
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)

    expect(result.id).toBe('TX-001')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(2500)
    expect(result.currency).toBe('GBP')
    expect(result.amountCaptured).toBe(2500)
    expect(result.captured).toBe(true)
    expect(result.customerId).toBe('CUST-001')
    expect(result.gateway).toBe('apexx')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a DECLINED transaction to failed with failure details', () => {
    const raw: RawApexxTransaction = {
      _id: 'TX-002',
      transaction_status: 'DECLINED',
      amount: 1000,
      currency: 'USD',
      reason_code: '05',
      reason_message: 'Do not honour',
    }
    const result = transformCharge(raw)

    expect(result.status).toBe('failed')
    expect(result.failureCode).toBe('05')
    expect(result.failureMessage).toBe('Do not honour')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a partially refunded transaction correctly', () => {
    const raw: RawApexxTransaction = {
      _id: 'TX-003',
      transaction_status: 'SETTLED',
      amount: 5000,
      currency: 'EUR',
      refunded_amount: 2000,
    }
    const result = transformCharge(raw)

    // refunded_amount > 0 but less than amount → partially_refunded
    expect(result.status).toBe('partially_refunded')
    expect(result.amountRefunded).toBe(2000)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a CANCELLED transaction to cancelled', () => {
    const raw: RawApexxTransaction = {
      _id: 'TX-004',
      transaction_status: 'CANCELLED',
      amount: 750,
      currency: 'GBP',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps an AUTHORISED transaction to pending', () => {
    const raw: RawApexxTransaction = {
      _id: 'TX-005',
      transaction_status: 'AUTHORISED',
      amount: 3000,
      currency: 'GBP',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})

describe('apexx untransformCharge', () => {
  it('round-trips canonical fields to snake_case APS body', () => {
    const canonical = { amount: 1500, currency: 'GBP', customerId: 'C-001', captured: true }
    const body = untransformCharge(canonical)

    expect(body.amount).toBe(1500)
    expect(body.currency).toBe('GBP')
    expect(body.customer_id).toBe('C-001')
    expect(body.capture_now).toBe(true)
  })
})

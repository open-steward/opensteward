import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawEasebuzzTransaction,
} from '../../../../../../../src/verticals/payments/adapters/easebuzz/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('easebuzz transformCharge', () => {
  it('maps a success transaction with full fields', () => {
    const raw: RawEasebuzzTransaction = {
      txnid: 'TXN001',
      easepayid: 'EASY001',
      status: 'success',
      amount: '500.00',
      net_amount_debit: '495.00',
      email: 'ravi@example.com',
      phone: '9876543210',
      firstname: 'Ravi',
      productinfo: 'Course fee',
      mode: 'CC',
      payment_source: 'easebuzz',
      pg_type: 'DIRECT',
      bank_ref_num: 'BANK123',
      bankcode: 'HDFC',
      card_type: 'VISA',
      cardCategory: 'CONSUMER',
      name_on_card: 'Ravi Kumar',
      addedon: '2024-03-01 05:30:00',
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('EASY001')
    expect(result.externalId).toBe('TXN001')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(50000)
    expect(result.currency).toBe('INR')
    expect(result.description).toBe('Course fee')
    expect(result.receiptEmail).toBe('ravi@example.com')
    expect(result.gateway).toBe('easebuzz')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps "pending" status to "pending"', () => {
    const raw: RawEasebuzzTransaction = {
      txnid: 'TXN002',
      easepayid: 'EASY002',
      status: 'pending',
      amount: '100.00',
      addedon: '2024-03-01 05:30:00',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps "failure" status to "failed" with error message', () => {
    const raw: RawEasebuzzTransaction = {
      txnid: 'TXN003',
      easepayid: 'EASY003',
      status: 'failure',
      amount: '250.00',
      error: 'E001',
      error_Message: 'Card declined',
      addedon: '2024-03-01 05:30:00',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(result.failureMessage).toBe('Card declined')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps "usercancelled" to "cancelled"', () => {
    const raw: RawEasebuzzTransaction = {
      txnid: 'TXN004',
      status: 'usercancelled',
      amount: '75.00',
      addedon: '2024-03-01 05:30:00',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps "refunded" status to "refunded"', () => {
    const raw: RawEasebuzzTransaction = {
      txnid: 'TXN005',
      easepayid: 'EASY005',
      status: 'refunded',
      amount: '200.00',
      addedon: '2024-03-01 05:30:00',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('refunded')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('converts major-unit rupee amount to paise (minor units)', () => {
    const raw: RawEasebuzzTransaction = {
      txnid: 'TXN006',
      status: 'success',
      amount: '1299.50',
      addedon: '2024-03-01 05:30:00',
    }
    const result = transformCharge(raw)
    expect(result.amount).toBe(129950)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})

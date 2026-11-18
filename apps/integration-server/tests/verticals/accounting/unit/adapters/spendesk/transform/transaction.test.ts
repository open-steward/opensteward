import { describe, it, expect } from 'vitest'
import {
  transformSettlement,
  type SpendeskSettlement,
} from '../../../../../../../src/verticals/accounting/adapters/spendesk/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'

function makeRaw(overrides: Partial<SpendeskSettlement> = {}): SpendeskSettlement {
  return {
    id: 'set_001',
    type: 'payment',
    medium: 'wireTransfer',
    amount: 11900,
    currency: 'EUR',
    billingAmount: 11900,
    billingCurrency: 'EUR',
    transactionDescription: 'Payment for SUPP-INV-100',
    state: 'CLEARED',
    createdAt: '2024-05-20T10:00:00.000Z',
    clearedAt: '2024-05-20T12:00:00.000Z',
    ...overrides,
  }
}

describe('transformSettlement (spendesk)', () => {
  it('maps id', () => {
    expect(transformSettlement(makeRaw()).id).toBe('set_001')
  })

  it('maps type field as-is', () => {
    expect(transformSettlement(makeRaw({ type: 'payment' })).type).toBe('payment')
  })

  it('maps currency', () => {
    expect(transformSettlement(makeRaw()).currency).toBe('EUR')
  })

  it('maps amount as-is (already minor units)', () => {
    expect(transformSettlement(makeRaw({ amount: 11900 })).totalAmount).toBe(11900)
  })

  it('maps wireTransfer medium to WIRE paymentMethod', () => {
    expect(transformSettlement(makeRaw({ medium: 'wireTransfer' })).paymentMethod).toBe('WIRE')
  })

  it('maps card medium to CARD paymentMethod', () => {
    expect(transformSettlement(makeRaw({ medium: 'card' })).paymentMethod).toBe('CARD')
  })

  it('maps unknown medium to uppercased value', () => {
    expect(transformSettlement(makeRaw({ medium: 'other' })).paymentMethod).toBe('OTHER')
  })

  it('maps transactionDescription to memo', () => {
    expect(transformSettlement(makeRaw()).memo).toBe('Payment for SUPP-INV-100')
  })

  it('maps createdAt to createdAt Date', () => {
    expect(transformSettlement(makeRaw()).createdAt).toEqual(new Date('2024-05-20T10:00:00.000Z'))
  })

  it('maps clearedAt to updatedAt Date', () => {
    expect(transformSettlement(makeRaw()).updatedAt).toEqual(new Date('2024-05-20T12:00:00.000Z'))
  })

  it('passes TransactionSchema.parse without throwing', () => {
    expect(() => TransactionSchema.parse(transformSettlement(makeRaw()))).not.toThrow()
  })
})

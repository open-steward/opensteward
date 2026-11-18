import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type OctopusPayment,
} from '../../../../../../../src/verticals/accounting/adapters/octopus/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'

function makeRaw(overrides: Partial<OctopusPayment> = {}): OctopusPayment {
  return {
    paymentId: 6001,
    paymentNumber: 'PAY-001',
    reference: 'SI-2024-001',
    relationId: 300,
    relationName: 'BVBA Acme',
    accountNumber: '550000',
    paymentDate: '2024-09-01',
    currency: 'EUR',
    amount: 6050,
    paymentType: 'BANK_TRANSFER',
    memo: 'Invoice settlement',
    ...overrides,
  }
}

describe('transformTransaction (octopus)', () => {
  it('maps paymentId to id (string)', () => {
    expect(transformTransaction(makeRaw()).id).toBe('6001')
  })

  it('falls back to paymentNumber when paymentId absent', () => {
    expect(transformTransaction(makeRaw({ paymentId: undefined })).id).toBe('PAY-001')
  })

  it('maps accountNumber to accountId', () => {
    expect(transformTransaction(makeRaw()).accountId).toBe('550000')
  })

  it('maps paymentType to type', () => {
    expect(transformTransaction(makeRaw()).type).toBe('BANK_TRANSFER')
  })

  it('maps reference', () => {
    expect(transformTransaction(makeRaw()).reference).toBe('SI-2024-001')
  })

  it('maps memo', () => {
    expect(transformTransaction(makeRaw()).memo).toBe('Invoice settlement')
  })

  it('maps currency', () => {
    expect(transformTransaction(makeRaw()).currency).toBe('EUR')
  })

  it('maps amount to totalAmount', () => {
    expect(transformTransaction(makeRaw()).totalAmount).toBe(6050)
  })

  it('maps paymentDate to createdAt', () => {
    expect(transformTransaction(makeRaw()).createdAt).toEqual(new Date('2024-09-01'))
  })

  it('maps relationId+name to contacts array', () => {
    const contacts = transformTransaction(makeRaw()).contacts!
    expect(contacts).toHaveLength(1)
    expect(contacts[0].id).toBe('300')
    expect(contacts[0].name).toBe('BVBA Acme')
  })

  it('does not include contacts when relationId absent', () => {
    expect(transformTransaction(makeRaw({ relationId: undefined })).contacts).toBeUndefined()
  })

  it('creates one lineitem', () => {
    expect(transformTransaction(makeRaw()).lineItems).toHaveLength(1)
    expect(transformTransaction(makeRaw()).lineItems![0].totalAmount).toBe(6050)
  })

  it('passes TransactionSchema.parse without throwing', () => {
    expect(() => TransactionSchema.parse(transformTransaction(makeRaw()))).not.toThrow()
  })
})

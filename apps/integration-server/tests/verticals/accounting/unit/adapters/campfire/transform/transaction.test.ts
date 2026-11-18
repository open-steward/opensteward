import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type CampfireTransaction,
} from '../../../../../../../src/verticals/accounting/adapters/campfire/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'

function makeTransaction(overrides: Partial<CampfireTransaction> = {}): CampfireTransaction {
  return {
    id: 300,
    account: 4000,
    account_name: 'Sales Revenue',
    vendor: 7,
    vendor_name: 'Acme Corp',
    memo: 'Payment for INV-101',
    posted_at: '2024-03-15T00:00:00Z',
    created_at: '2024-03-14T09:00:00Z',
    last_modified_at: '2024-03-15T10:00:00Z',
    currency: 'USD',
    amount: 110.0,
    debit_amount: 110.0,
    credit_amount: 0.0,
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps id to string', () => {
    expect(transformTransaction(makeTransaction()).id).toBe('300')
  })

  it('maps account to accountId as string', () => {
    expect(transformTransaction(makeTransaction()).accountId).toBe('4000')
  })

  it('maps currency', () => {
    expect(transformTransaction(makeTransaction()).currency).toBe('USD')
  })

  it('maps memo', () => {
    expect(transformTransaction(makeTransaction()).memo).toBe('Payment for INV-101')
  })

  it('converts amount to totalAmount in minor units', () => {
    expect(transformTransaction(makeTransaction({ amount: 110.0 })).totalAmount).toBe(11000)
  })

  it('sets type to DEBIT when debit_amount > 0', () => {
    expect(
      transformTransaction(makeTransaction({ debit_amount: 110.0, credit_amount: 0.0 })).type,
    ).toBe('DEBIT')
  })

  it('sets type to CREDIT when credit_amount > 0 and debit_amount is 0', () => {
    expect(
      transformTransaction(makeTransaction({ debit_amount: 0.0, credit_amount: 110.0 })).type,
    ).toBe('CREDIT')
  })

  it('sets type to undefined when both debit and credit are 0', () => {
    expect(
      transformTransaction(makeTransaction({ debit_amount: 0.0, credit_amount: 0.0 })).type,
    ).toBeUndefined()
  })

  it('sets type to undefined when both debit and credit are absent', () => {
    expect(
      transformTransaction(makeTransaction({ debit_amount: null, credit_amount: null })).type,
    ).toBeUndefined()
  })

  it('maps vendor to contacts array', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts![0].id).toBe('7')
    expect(result.contacts![0].name).toBe('Acme Corp')
  })

  it('includes contact from merchant_name when vendor is absent', () => {
    const result = transformTransaction(
      makeTransaction({ vendor: null, vendor_name: null, merchant_name: 'Some Merchant' }),
    )
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts![0].name).toBe('Some Merchant')
    expect(result.contacts![0].id).toBeUndefined()
  })

  it('returns empty contacts when vendor and merchant_name are absent', () => {
    const result = transformTransaction(
      makeTransaction({ vendor: null, vendor_name: null, merchant_name: undefined }),
    )
    expect(result.contacts).toEqual([])
  })

  it('builds a single lineitem from account when account is present', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.accountId).toBe('4000')
    expect(li.name).toBe('Sales Revenue')
    expect(li.description).toBe('Payment for INV-101')
    expect(li.totalAmount).toBe(11000)
  })

  it('returns empty lineItems when account is absent', () => {
    const result = transformTransaction(makeTransaction({ account: null }))
    expect(result.lineItems).toEqual([])
  })

  it('maps created_at to createdAt Date', () => {
    expect(transformTransaction(makeTransaction()).createdAt).toEqual(
      new Date('2024-03-14T09:00:00Z'),
    )
  })

  it('maps last_modified_at to updatedAt Date', () => {
    expect(transformTransaction(makeTransaction()).updatedAt).toEqual(
      new Date('2024-03-15T10:00:00Z'),
    )
  })

  it('passes raw object as metadata', () => {
    const raw = makeTransaction()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })

  it('output passes schema validation', () => {
    expect(() => TransactionSchema.parse(transformTransaction(makeTransaction()))).not.toThrow()
  })
})

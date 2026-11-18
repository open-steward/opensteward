import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import {
  transformTransaction,
  type FreeAgentBankTransaction,
} from '../../../../../../../src/verticals/accounting/adapters/freeagent/transform/transaction'

function makeTransaction(overrides: Partial<FreeAgentBankTransaction> = {}): FreeAgentBankTransaction {
  return {
    url: 'https://api.freeagent.com/v2/bank_transactions/200',
    bank_account: 'https://api.freeagent.com/v2/bank_accounts/7',
    dated_on: '2024-10-15',
    description: 'Office supplies',
    amount: '-150.00',
    gross_value: '-150.00',
    foreign_currency_amount: '',
    currency: 'GBP',
    type: 'Deb',
    is_manual: false,
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('extracts id from url', () => {
    expect(transformTransaction(makeTransaction()).id).toBe('200')
  })

  it('extracts accountId from bank_account url', () => {
    expect(transformTransaction(makeTransaction()).accountId).toBe('7')
  })

  it('maps type correctly', () => {
    expect(transformTransaction(makeTransaction()).type).toBe('Deb')
  })

  it('maps description to memo', () => {
    expect(transformTransaction(makeTransaction()).memo).toBe('Office supplies')
  })

  it('maps currency correctly', () => {
    expect(transformTransaction(makeTransaction()).currency).toBe('GBP')
  })

  it('parses totalAmount from gross_value', () => {
    expect(transformTransaction(makeTransaction()).totalAmount).toBe(-150)
  })

  it('parses dated_on as createdAt Date', () => {
    expect(transformTransaction(makeTransaction()).createdAt).toEqual(new Date('2024-10-15'))
  })

  it('returns undefined createdAt when dated_on is empty', () => {
    expect(transformTransaction(makeTransaction({ dated_on: '' })).createdAt).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeTransaction()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeTransaction())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})

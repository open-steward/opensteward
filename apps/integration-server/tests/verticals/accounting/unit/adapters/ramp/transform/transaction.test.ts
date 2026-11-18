import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type RampTransaction,
} from '../../../../../../../src/verticals/accounting/adapters/ramp/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'

function makeTxn(overrides: Partial<RampTransaction> = {}): RampTransaction {
  return {
    id: 'txn_uuid_001',
    amount: { amount: 8500, currency_code: 'USD' },
    currency_code: 'USD',
    merchant_name: 'CHIPOTLE 1234',
    sk_category_name: 'Meals & Entertainment',
    card_holder: {
      first_name: 'Alice',
      last_name: 'Wong',
      department_name: 'Engineering',
      location_name: 'SF HQ',
      user_id: 'user_abc',
    },
    card_id: 'card_xyz',
    accounting_date: '2024-03-06',
    user_transaction_time: '2024-03-05T19:00:00Z',
    memo: 'Team lunch',
    sync_status: 'READY_TO_SYNC',
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps id', () => {
    expect(transformTransaction(makeTxn()).id).toBe('txn_uuid_001')
  })

  it('always sets type to PAYMENT', () => {
    expect(transformTransaction(makeTxn()).type).toBe('PAYMENT')
  })

  it('maps memo', () => {
    expect(transformTransaction(makeTxn()).memo).toBe('Team lunch')
  })

  it('maps amount.currency_code to currency', () => {
    expect(transformTransaction(makeTxn()).currency).toBe('USD')
  })

  it('maps amount.amount to totalAmount without conversion (already minor units)', () => {
    expect(transformTransaction(makeTxn()).totalAmount).toBe(8500)
  })

  it('maps card_holder.user_id to contacts[0].id', () => {
    const result = transformTransaction(makeTxn())
    expect(result.contacts?.[0].id).toBe('user_abc')
  })

  it('builds contact name from first_name + last_name', () => {
    const result = transformTransaction(makeTxn())
    expect(result.contacts?.[0].name).toBe('Alice Wong')
  })

  it('contacts is undefined when card_holder.user_id is absent', () => {
    const result = transformTransaction(makeTxn({ card_holder: { first_name: 'Alice' } }))
    expect(result.contacts).toBeUndefined()
  })

  it('maps user_transaction_time to createdAt as Date', () => {
    expect(transformTransaction(makeTxn()).createdAt).toEqual(new Date('2024-03-05T19:00:00Z'))
  })

  it('maps accounting_date to updatedAt as Date', () => {
    expect(transformTransaction(makeTxn()).updatedAt).toEqual(new Date('2024-03-06'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeTxn()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })

  it('produces output that passes TransactionSchema validation', () => {
    expect(() => TransactionSchema.parse(transformTransaction(makeTxn()))).not.toThrow()
  })

  it('produces schema-valid output when optional fields are absent', () => {
    const result = transformTransaction({
      id: 'txn_001',
      amount: { amount: 0, currency_code: 'USD' },
    })
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})

import { describe, it, expect } from 'vitest'
import { expectDate } from '../../../../../../date-assertions'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import {
  transformExpense,
  type NetvisorExpense,
} from '../../../../../../../src/verticals/accounting/adapters/netvisor/transform/expense'

function makeExpense(overrides: Partial<NetvisorExpense> = {}): NetvisorExpense {
  return {
    NetvisorKey: 88001,
    Description: 'Toimistotarvikkeet',
    VendorIdentifier: 'VENDOR-3',
    Currency: 'EUR',
    Amount: 1500,
    VatAmount: 300,
    ExpenseDate: '2024-02-15',
    ...overrides,
  }
}

describe('transformExpense', () => {
  it('maps NetvisorKey to id as string', () => {
    expect(transformExpense(makeExpense()).id).toBe('88001')
  })

  it('maps Description to name', () => {
    expect(transformExpense(makeExpense()).name).toBe('Toimistotarvikkeet')
  })

  it('maps VendorIdentifier to contactId', () => {
    expect(transformExpense(makeExpense()).contactId).toBe('VENDOR-3')
  })

  it('maps Currency to currency', () => {
    expect(transformExpense(makeExpense()).currency).toBe('EUR')
  })

  it('maps Amount to totalAmount', () => {
    expect(transformExpense(makeExpense()).totalAmount).toBe(1500)
  })

  it('maps VatAmount to taxAmount', () => {
    expect(transformExpense(makeExpense()).taxAmount).toBe(300)
  })

  it('maps ExpenseDate to postedAt as Date', () => {
    const result = transformExpense(makeExpense())
    expect(result.postedAt).toBeInstanceOf(Date)
    expect(expectDate(result.postedAt).toISOString().startsWith('2024-02-15')).toBe(true)
  })

  it('returns undefined postedAt when ExpenseDate is empty', () => {
    expect(transformExpense(makeExpense({ ExpenseDate: '' })).postedAt).toBeUndefined()
  })

  it('returns undefined name when Description is empty', () => {
    expect(transformExpense(makeExpense({ Description: '' })).name).toBeUndefined()
  })

  it('returns undefined contactId when VendorIdentifier is empty', () => {
    expect(transformExpense(makeExpense({ VendorIdentifier: '' })).contactId).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeExpense()
    expect(transformExpense(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeExpense())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})

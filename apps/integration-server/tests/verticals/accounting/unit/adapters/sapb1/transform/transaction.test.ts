import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import {
  transformTransaction,
  type SapB1Payment,
} from '../../../../../../../src/verticals/accounting/adapters/sapb1/transform/transaction'

function makeTransaction(overrides: Partial<SapB1Payment> = {}): SapB1Payment {
  return {
    DocNum: 9001,
    CardCode: 'BP-001',
    CardName: 'Acme Corp',
    DocDate: '2024-03-01',
    DocCurrency: 'USD',
    DocTotal: 1500,
    TransferSum: 1500,
    Remarks: 'Invoice payment',
    Cancelled: 'N',
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps DocNum as string to id', () => {
    expect(transformTransaction(makeTransaction()).id).toBe('9001')
  })

  it('maps Remarks to memo', () => {
    expect(transformTransaction(makeTransaction()).memo).toBe('Invoice payment')
  })

  it('maps DocCurrency to currency', () => {
    expect(transformTransaction(makeTransaction()).currency).toBe('USD')
  })

  it('maps DocTotal to totalAmount', () => {
    expect(transformTransaction(makeTransaction()).totalAmount).toBe(1500)
  })

  it('maps CardCode to contacts[0].id', () => {
    expect(transformTransaction(makeTransaction()).contacts?.[0].id).toBe('BP-001')
  })

  it('maps CardName to contacts[0].name', () => {
    expect(transformTransaction(makeTransaction()).contacts?.[0].name).toBe('Acme Corp')
  })

  it('parses DocDate as Date', () => {
    expect(transformTransaction(makeTransaction()).createdAt).toEqual(new Date('2024-03-01'))
  })

  it('sets createdAt to undefined when DocDate is empty', () => {
    expect(transformTransaction(makeTransaction({ DocDate: '' })).createdAt).toBeUndefined()
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeTransaction()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeTransaction())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})

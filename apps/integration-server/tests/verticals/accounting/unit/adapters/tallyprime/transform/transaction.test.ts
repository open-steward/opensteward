import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import {
  transformTransaction,
  type TallyTransaction,
} from '../../../../../../../src/verticals/accounting/adapters/tallyprime/transform/transaction'

function makeTransaction(overrides: Partial<TallyTransaction> = {}): TallyTransaction {
  return {
    GUID: 'f1e2d3c4-b5a6-4978-8def-0123456789ab',
    MASTERID: '7042',
    VOUCHERNUMBER: 'JV-2024-001',
    VOUCHERTYPENAME: 'Payment',
    PARTYLEDGERNAME: 'Vendor ABC',
    DATE: '20240115',
    AMOUNT: '75000',
    NARRATION: 'Payment for services',
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps GUID to id', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.id).toBe('f1e2d3c4-b5a6-4978-8def-0123456789ab')
  })

  it('falls back to MASTERID when GUID is empty', () => {
    const result = transformTransaction(makeTransaction({ GUID: '' }))
    expect(result.id).toBe('7042')
  })

  it('maps VOUCHERTYPENAME to type', () => {
    const result = transformTransaction(makeTransaction({ VOUCHERTYPENAME: 'Receipt' }))
    expect(result.type).toBe('Receipt')
  })

  it('maps VOUCHERNUMBER to reference', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.reference).toBe('JV-2024-001')
  })

  it('maps NARRATION to memo', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.memo).toBe('Payment for services')
  })

  it('parses AMOUNT to totalAmount', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.totalAmount).toBe(75000)
  })

  it('parses DATE to postedAt Date', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps PARTYLEDGERNAME to contacts', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts![0].id).toBe('Vendor ABC')
    expect(result.contacts![0].name).toBe('Vendor ABC')
  })

  it('sets contacts to undefined when PARTYLEDGERNAME is empty', () => {
    const result = transformTransaction(makeTransaction({ PARTYLEDGERNAME: '' }))
    expect(result.contacts).toBeUndefined()
  })

  it('sets totalAmount to undefined when AMOUNT is not a number', () => {
    const result = transformTransaction(makeTransaction({ AMOUNT: 'N/A' }))
    expect(result.totalAmount).toBeUndefined()
  })

  it('passes raw object as metadata (reference equality)', () => {
    const raw = makeTransaction()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeTransaction())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})

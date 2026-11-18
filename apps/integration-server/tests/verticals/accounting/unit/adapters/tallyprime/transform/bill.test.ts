import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import {
  transformBill,
  type TallyBill,
} from '../../../../../../../src/verticals/accounting/adapters/tallyprime/transform/bill'

function makeBill(overrides: Partial<TallyBill> = {}): TallyBill {
  return {
    GUID: '84f4d69e-1a2b-4c3d-9e0f-1234567890ab',
    MASTERID: '4521',
    VOUCHERNUMBER: 'PUR/2024/001',
    PARTYLEDGERNAME: 'Supplier Co',
    DATE: '20240315',
    AMOUNT: '-5000.00',
    NARRATION: 'Office supplies purchase',
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps GUID to id', () => {
    expect(transformBill(makeBill()).id).toBe('84f4d69e-1a2b-4c3d-9e0f-1234567890ab')
  })

  it('falls back to MASTERID when GUID is empty', () => {
    expect(transformBill(makeBill({ GUID: '' })).id).toBe('4521')
  })

  it('maps VOUCHERNUMBER to billNumber', () => {
    expect(transformBill(makeBill()).billNumber).toBe('PUR/2024/001')
  })

  it('maps PARTYLEDGERNAME to contactId', () => {
    expect(transformBill(makeBill()).contactId).toBe('Supplier Co')
  })

  it('parses AMOUNT to totalAmount', () => {
    expect(transformBill(makeBill()).totalAmount).toBe(-5000)
  })

  it('parses DATE as postedAt Date object', () => {
    expect(transformBill(makeBill()).postedAt).toEqual(new Date('2024-03-15'))
  })

  it('maps NARRATION to notes', () => {
    expect(transformBill(makeBill()).notes).toBe('Office supplies purchase')
  })

  it('always sets status to AUTHORIZED', () => {
    // The voucher export only ever returns vouchers already recorded in
    // Tally's books — there is no separate "draft" state to read back, the
    // same reasoning invoice.ts in this adapter already uses.
    expect(transformBill(makeBill()).status).toBe('AUTHORIZED')
  })

  it('sets contactId to undefined when PARTYLEDGERNAME is empty', () => {
    expect(transformBill(makeBill({ PARTYLEDGERNAME: '' })).contactId).toBeUndefined()
  })

  it('sets billNumber to undefined when VOUCHERNUMBER is empty', () => {
    expect(transformBill(makeBill({ VOUCHERNUMBER: '' })).billNumber).toBeUndefined()
  })

  it('sets totalAmount to undefined when AMOUNT is not a number', () => {
    expect(transformBill(makeBill({ AMOUNT: 'N/A' })).totalAmount).toBeUndefined()
  })

  it('sets postedAt to undefined when DATE is invalid', () => {
    expect(transformBill(makeBill({ DATE: 'invalid-date' })).postedAt).toBeUndefined()
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeBill()
    expect(transformBill(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeBill())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})

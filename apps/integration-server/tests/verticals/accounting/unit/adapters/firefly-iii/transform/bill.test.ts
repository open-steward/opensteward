import { describe, it, expect } from 'vitest'
import {
  transformBill,
  type FireflyBillResource,
} from '../../../../../../../src/verticals/accounting/adapters/firefly-iii/transform/bill'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'

function makeBill(overrides: Partial<FireflyBillResource['attributes']> = {}): FireflyBillResource {
  return {
    type: 'bills',
    id: '10',
    attributes: {
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-06-01T00:00:00.000Z',
      name: 'Monthly Rent',
      currency_id: '1',
      currency_code: 'EUR',
      amount_min: '800.00',
      amount_max: '900.00',
      amount_avg: '850.00',
      date: '2024-06-01',
      end_date: null,
      extension_date: null,
      repeat_freq: 'monthly',
      skip: 0,
      active: true,
      notes: 'Office rent',
      ...overrides,
    },
  }
}

describe('transformBill (firefly-iii)', () => {
  it('maps id from resource id', () => {
    expect(transformBill(makeBill()).id).toBe('10')
  })

  it('maps name to billNumber', () => {
    expect(transformBill(makeBill()).billNumber).toBe('Monthly Rent')
  })

  it('uses amount_avg for totalAmount when available', () => {
    // '850.00' → 85000
    expect(transformBill(makeBill()).totalAmount).toBe(85000)
  })

  it('falls back to amount_min when amount_avg is empty string', () => {
    // '800.00' → 80000
    const result = transformBill(makeBill({ amount_avg: '', amount_min: '800.00' }))
    expect(result.totalAmount).toBe(80000)
  })

  it('maps active=true with no end_date to AUTHORIZED', () => {
    expect(transformBill(makeBill({ active: true, end_date: null })).status).toBe('AUTHORIZED')
  })

  it('maps active=false to VOIDED', () => {
    expect(transformBill(makeBill({ active: false })).status).toBe('VOIDED')
  })

  it('maps past end_date to PAID', () => {
    // A date well in the past
    const result = transformBill(makeBill({ active: true, end_date: '2020-01-01' }))
    expect(result.status).toBe('PAID')
  })

  it('maps currency_code to currency', () => {
    expect(transformBill(makeBill()).currency).toBe('EUR')
  })

  it('maps date to postedAt as a Date', () => {
    expect(transformBill(makeBill()).postedAt).toEqual(new Date('2024-06-01'))
  })

  it('maps end_date to dueAt as a Date when present', () => {
    const result = transformBill(makeBill({ end_date: '2025-12-31' }))
    expect(result.dueAt).toEqual(new Date('2025-12-31'))
  })

  it('maps createdAt and updatedAt', () => {
    const result = transformBill(makeBill())
    expect(result.createdAt).toEqual(new Date('2024-01-01T00:00:00.000Z'))
    expect(result.updatedAt).toEqual(new Date('2024-06-01T00:00:00.000Z'))
  })

  it('produces a schema-valid Bill', () => {
    expect(() => BillSchema.parse(transformBill(makeBill()))).not.toThrow()
  })
})

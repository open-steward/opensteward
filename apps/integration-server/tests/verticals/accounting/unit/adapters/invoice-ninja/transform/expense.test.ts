import { describe, it, expect } from 'vitest'
import {
  transformExpense,
  type InvoiceNinjaExpense,
} from '../../../../../../../src/verticals/accounting/adapters/invoice-ninja/transform/expense'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'

function makeExpense(overrides: Partial<InvoiceNinjaExpense> = {}): InvoiceNinjaExpense {
  return {
    id: 'expense-1',
    vendor_id: 'vendor-99',
    client_id: null,
    category_id: 'cat-10',
    currency_id: '3', // EUR
    amount: 2500,
    tax_amount: 250,
    payment_date: '2024-02-15',
    date: '2024-02-10',
    public_notes: 'Office supplies',
    private_notes: 'Internal note',
    payment_type_id: '4',
    is_deleted: false,
    created_at: 1700000000,
    updated_at: 1700100000,
    ...overrides,
  }
}

describe('transformExpense', () => {
  it('maps id', () => {
    expect(transformExpense(makeExpense()).id).toBe('expense-1')
  })

  it('maps name from public_notes', () => {
    expect(transformExpense(makeExpense()).name).toBe('Office supplies')
  })

  it('returns undefined name when public_notes is absent', () => {
    expect(transformExpense(makeExpense({ public_notes: null })).name).toBeUndefined()
  })

  it('maps contactId from vendor_id when present', () => {
    expect(transformExpense(makeExpense()).contactId).toBe('vendor-99')
  })

  it('falls back to client_id when vendor_id is absent', () => {
    const result = transformExpense(makeExpense({ vendor_id: null, client_id: 'client-55' }))
    expect(result.contactId).toBe('client-55')
  })

  it('maps currency_id=3 to EUR', () => {
    expect(transformExpense(makeExpense()).currency).toBe('EUR')
  })

  it('returns undefined currency for absent currency_id', () => {
    expect(transformExpense(makeExpense({ currency_id: null })).currency).toBeUndefined()
  })

  it('maps taxAmount from tax_amount', () => {
    expect(transformExpense(makeExpense()).taxAmount).toBe(250)
  })

  it('maps totalAmount from amount', () => {
    expect(transformExpense(makeExpense()).totalAmount).toBe(2500)
  })

  it('maps paymentMethod from payment_type_id as string', () => {
    expect(transformExpense(makeExpense({ payment_type_id: '4' })).paymentMethod).toBe('4')
  })

  it('returns undefined paymentMethod when payment_type_id is null', () => {
    expect(transformExpense(makeExpense({ payment_type_id: null })).paymentMethod).toBeUndefined()
  })

  it('maps postedAt from date string', () => {
    expect(transformExpense(makeExpense()).postedAt).toEqual(new Date('2024-02-10'))
  })

  it('maps createdAt from epoch (×1000)', () => {
    expect(transformExpense(makeExpense()).createdAt).toEqual(new Date(1700000000 * 1000))
  })

  it('maps updatedAt from epoch (×1000)', () => {
    expect(transformExpense(makeExpense()).updatedAt).toEqual(new Date(1700100000 * 1000))
  })

  it('passes raw object as metadata', () => {
    const raw = makeExpense()
    expect(transformExpense(raw).metadata).toBe(raw)
  })

  it('passes ExpenseSchema validation', () => {
    expect(() => ExpenseSchema.parse(transformExpense(makeExpense()))).not.toThrow()
  })
})

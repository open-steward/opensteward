import { describe, it, expect } from 'vitest'
import {
  transformBill,
  type KlaraBill,
} from '../../../../../../../src/verticals/accounting/adapters/klara/transform/bill'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'

function makeBill(overrides: Partial<KlaraBill> = {}): KlaraBill {
  return {
    id: 'bill-1',
    bill_number: 'B-2024-001',
    status: 'open',
    contact_id: 'cont-1',
    currency: 'CHF',
    total_amount: 12000,
    tax_amount: 1000,
    paid_amount: 0,
    balance_amount: 12000,
    bill_date: '2024-03-01T00:00:00.000Z',
    due_date: '2030-04-01T00:00:00.000Z',
    notes: 'Test bill',
    created_at: '2024-03-01T00:00:00.000Z',
    updated_at: '2024-03-02T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps core fields', () => {
    const result = transformBill(makeBill())
    expect(result.id).toBe('bill-1')
    expect(result.billNumber).toBe('B-2024-001')
    expect(result.contactId).toBe('cont-1')
    expect(result.currency).toBe('CHF')
    expect(result.totalAmount).toBe(12000)
    expect(result.taxAmount).toBe(1000)
    expect(result.notes).toBe('Test bill')
  })

  it('maps status draft to DRAFT', () => {
    expect(transformBill(makeBill({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps status open to AUTHORIZED', () => {
    expect(transformBill(makeBill({ status: 'open' })).status).toBe('AUTHORIZED')
  })

  it('maps status paid to PAID', () => {
    expect(transformBill(makeBill({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps status voided to VOIDED', () => {
    expect(transformBill(makeBill({ status: 'voided' })).status).toBe('VOIDED')
  })

  it('infers PAID from balance math when status unknown', () => {
    const result = transformBill(
      makeBill({ status: undefined, balance_amount: 0, total_amount: 5000 }),
    )
    expect(result.status).toBe('PAID')
  })

  it('parses dates as Date objects', () => {
    const result = transformBill(makeBill())
    expect(result.postedAt).toEqual(new Date('2024-03-01T00:00:00.000Z'))
    expect(result.dueAt).toEqual(new Date('2030-04-01T00:00:00.000Z'))
  })

  it('maps positions to lineItems', () => {
    const result = transformBill(
      makeBill({
        positions: [
          {
            id: 'pos-1',
            description: 'Widget',
            quantity: 2,
            unit_price: 5000,
            total_price: 10000,
            account_id: 'acct-1',
          },
        ],
      }),
    )
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].itemDescription).toBe('Widget')
    expect(result.lineItems![0].unitQuantity).toBe(2)
    expect(result.lineItems![0].totalAmount).toBe(10000)
  })

  it('passes schema validation', () => {
    expect(() => BillSchema.parse(transformBill(makeBill()))).not.toThrow()
  })
})

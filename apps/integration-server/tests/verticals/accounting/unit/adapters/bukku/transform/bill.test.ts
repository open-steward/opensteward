import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type BukkuBill } from '../../../../../../../src/verticals/accounting/adapters/bukku/transform/bill'

function makeRaw(overrides: Partial<BukkuBill> = {}): BukkuBill {
  return {
    id: '55',
    number: 'BILL-001',
    date: '2024-02-01',
    due_date: '2024-02-28',
    total: 2300,
    tax_total: 300,
    balance_due: 2300,
    sub_total: 2000,
    currency_code: 'MYR',
    contact_id: '99',
    contact_name: 'Supplier Co',
    status: 'draft',
    line_items: [],
    ...overrides,
  }
}

describe('transformBill (bukku)', () => {
  it('maps core fields correctly', () => {
    const result = transformBill(makeRaw())
    expect(result.id).toBe('55')
    expect(result.billNumber).toBe('BILL-001')
    expect(result.contactId).toBe('99')
    expect(result.totalAmount).toBe(2300)
    expect(result.taxAmount).toBe(300)
    expect(result.balanceAmount).toBe(2300)
    expect(result.currency).toBe('MYR')
  })

  it('parses dates as Date objects', () => {
    const result = transformBill(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-02-01'))
    expect(result.dueAt).toEqual(new Date('2024-02-28'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw({ number: 'BILL-999' })
    const result = transformBill(raw)
    expect(result.metadata).toBe(raw)
    expect((result.metadata as Record<string, unknown>)['number']).toBe('BILL-999')
  })

  it('maps draft status to DRAFT', () => {
    expect(transformBill(makeRaw({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps received status to AUTHORIZED', () => {
    expect(transformBill(makeRaw({ status: 'received' })).status).toBe('AUTHORIZED')
  })

  it('maps paid status to PAID', () => {
    expect(transformBill(makeRaw({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps overdue status to OVERDUE', () => {
    expect(transformBill(makeRaw({ status: 'overdue' })).status).toBe('OVERDUE')
  })

  it('maps void status to VOIDED', () => {
    expect(transformBill(makeRaw({ status: 'void' })).status).toBe('VOIDED')
  })

  it('maps line items to lineItems', () => {
    const raw = makeRaw({
      line_items: [
        {
          id: '1',
          description: 'Office Supplies',
          quantity: 2,
          unit_price: 100,
          amount: 200,
          tax_amount: 12,
          account_id: '600',
          account_code: '6-001',
          tax_rate_id: '6',
          discount: 0,
        },
      ],
    })
    const result = transformBill(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('1')
    expect(li.itemDescription).toBe('Office Supplies')
    expect(li.unitAmount).toBe(100)
    expect(li.unitQuantity).toBe(2)
    expect(li.totalAmount).toBe(200)
    expect(li.taxAmount).toBe(12)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeRaw())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})

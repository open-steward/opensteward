import { describe, it, expect } from 'vitest'
import {
  transformBill,
  type RoutablePayable,
} from '../../../../../../../src/verticals/accounting/adapters/routable/transform/bill'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import type { RoutableLineItem } from '../../../../../../../src/verticals/accounting/adapters/routable/transform/invoice'

function makeLineItem(overrides: Partial<RoutableLineItem> = {}): RoutableLineItem {
  return {
    id: 'li_001',
    description: 'Consulting services',
    unit_price: '100.00',
    quantity: 2,
    amount: '200.00',
    ...overrides,
  }
}

function makeBill(overrides: Partial<RoutablePayable> = {}): RoutablePayable {
  return {
    id: 'pay_abc123',
    status: 'needs_approval',
    bill_number: 'BILL-2024-001',
    amount: '200.00',
    amount_due: '200.00',
    amount_paid: '0.00',
    currency_code: 'USD',
    company: { id: 'cmp_vendor1', display_name: 'Acme Supplies' },
    line_items: [makeLineItem()],
    created_at: '2024-03-01T10:00:00Z',
    issued_on: '2024-03-01',
    due_on: '2024-04-01',
    message: 'Net 30 terms',
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps id', () => {
    expect(transformBill(makeBill()).id).toBe('pay_abc123')
  })

  it('maps bill_number to billNumber', () => {
    expect(transformBill(makeBill()).billNumber).toBe('BILL-2024-001')
  })

  it('maps company object id to contactId', () => {
    expect(transformBill(makeBill()).contactId).toBe('cmp_vendor1')
  })

  it('maps company string directly to contactId', () => {
    const result = transformBill(makeBill({ company: 'cmp_string_id' }))
    expect(result.contactId).toBe('cmp_string_id')
  })

  it('maps currency_code to currency', () => {
    expect(transformBill(makeBill()).currency).toBe('USD')
  })

  it('converts string amounts to minor units (× 100)', () => {
    const result = transformBill(makeBill())
    expect(result.totalAmount).toBe(20000)
    expect(result.balanceAmount).toBe(20000)
    expect(result.paidAmount).toBe(0)
  })

  it('maps message to notes', () => {
    expect(transformBill(makeBill()).notes).toBe('Net 30 terms')
  })

  it('maps issued_on and due_on to Date objects', () => {
    const result = transformBill(makeBill())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
    expect(result.dueAt).toEqual(new Date('2024-04-01'))
  })

  it('maps created_at to createdAt Date', () => {
    expect(transformBill(makeBill()).createdAt).toEqual(new Date('2024-03-01T10:00:00Z'))
  })

  describe('status mapping', () => {
    it('maps needs_approval to AUTHORIZED', () => {
      expect(transformBill(makeBill({ status: 'needs_approval' })).status).toBe('AUTHORIZED')
    })

    it('maps ready_to_send to AUTHORIZED', () => {
      expect(transformBill(makeBill({ status: 'ready_to_send' })).status).toBe('AUTHORIZED')
    })

    it('maps scheduled to AUTHORIZED', () => {
      expect(transformBill(makeBill({ status: 'scheduled' })).status).toBe('AUTHORIZED')
    })

    it('maps pending to SUBMITTED', () => {
      expect(transformBill(makeBill({ status: 'pending' })).status).toBe('SUBMITTED')
    })

    it('maps processing to SUBMITTED', () => {
      expect(transformBill(makeBill({ status: 'processing' })).status).toBe('SUBMITTED')
    })

    it('maps initiated to SUBMITTED', () => {
      expect(transformBill(makeBill({ status: 'initiated' })).status).toBe('SUBMITTED')
    })

    it('maps completed to PAID', () => {
      expect(transformBill(makeBill({ status: 'completed' })).status).toBe('PAID')
    })

    it('maps externally_paid to PAID', () => {
      expect(transformBill(makeBill({ status: 'externally_paid' })).status).toBe('PAID')
    })

    it('maps issue to OVERDUE', () => {
      expect(transformBill(makeBill({ status: 'issue' })).status).toBe('OVERDUE')
    })

    it('maps failed to OVERDUE', () => {
      expect(transformBill(makeBill({ status: 'failed' })).status).toBe('OVERDUE')
    })

    it('maps canceled to VOIDED', () => {
      expect(transformBill(makeBill({ status: 'canceled' })).status).toBe('VOIDED')
    })

    it('maps unknown status to DRAFT', () => {
      expect(transformBill(makeBill({ status: undefined })).status).toBe('DRAFT')
    })
  })

  describe('line items', () => {
    it('maps line_items to lineItems with correct field mappings', () => {
      const result = transformBill(makeBill())
      expect(result.lineItems).toHaveLength(1)
      const li = result.lineItems![0]
      expect(li.id).toBe('li_001')
      expect(li.itemDescription).toBe('Consulting services')
      expect(li.unitAmount).toBe(10000) // '100.00' × 100
      expect(li.unitQuantity).toBe(2)
      expect(li.totalAmount).toBe(20000) // '200.00' × 100
    })

    it('produces empty lineItems array when line_items is absent', () => {
      const result = transformBill(makeBill({ line_items: undefined }))
      expect(result.lineItems).toEqual([])
    })
  })

  it('passes raw object as metadata (reference equality)', () => {
    const raw = makeBill()
    expect(transformBill(raw).metadata).toBe(raw)
  })

  it('passes BillSchema.parse without throwing', () => {
    const result = transformBill(makeBill())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})

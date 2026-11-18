import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  type RoutableReceivable,
  type RoutableLineItem,
} from '../../../../../../../src/verticals/accounting/adapters/routable/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'

function makeLineItem(overrides: Partial<RoutableLineItem> = {}): RoutableLineItem {
  return {
    id: 'li_inv_001',
    description: 'Product license',
    unit_price: '50.00',
    quantity: 3,
    amount: '150.00',
    ...overrides,
  }
}

function makeReceivable(overrides: Partial<RoutableReceivable> = {}): RoutableReceivable {
  return {
    id: 'rec_abc123',
    status: 'ready_to_send',
    bill_number: 'INV-2024-001',
    amount: '300.00',
    amount_due: '300.00',
    amount_paid: '0.00',
    currency_code: 'USD',
    company: { id: 'cmp_customer1', display_name: 'Beta Corp' },
    line_items: [makeLineItem()],
    created_at: '2024-04-01T12:00:00Z',
    issued_on: '2024-04-01',
    due_on: '2024-05-01',
    reference: 'PO-BETA-001',
    message: 'Thank you for your business.',
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps id', () => {
    expect(transformInvoice(makeReceivable()).id).toBe('rec_abc123')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeReceivable()).type).toBe('INVOICE')
  })

  it('maps bill_number to invoiceNumber', () => {
    expect(transformInvoice(makeReceivable()).invoiceNumber).toBe('INV-2024-001')
  })

  it('maps company object id to contactId', () => {
    expect(transformInvoice(makeReceivable()).contactId).toBe('cmp_customer1')
  })

  it('maps company string directly to contactId', () => {
    const result = transformInvoice(makeReceivable({ company: 'cmp_string_id' }))
    expect(result.contactId).toBe('cmp_string_id')
  })

  it('maps currency_code to currency', () => {
    expect(transformInvoice(makeReceivable()).currency).toBe('USD')
  })

  it('converts string amounts to minor units (× 100)', () => {
    const result = transformInvoice(makeReceivable())
    expect(result.totalAmount).toBe(30000)
    expect(result.balanceAmount).toBe(30000)
    expect(result.paidAmount).toBe(0)
  })

  it('maps reference field', () => {
    expect(transformInvoice(makeReceivable()).reference).toBe('PO-BETA-001')
  })

  it('falls back to external_id when reference is absent', () => {
    const result = transformInvoice(makeReceivable({ reference: undefined, external_id: 'ext_99' }))
    expect(result.reference).toBe('ext_99')
  })

  it('maps message to notes', () => {
    expect(transformInvoice(makeReceivable()).notes).toBe('Thank you for your business.')
  })

  it('maps issued_on and due_on to Date objects', () => {
    const result = transformInvoice(makeReceivable())
    expect(result.postedAt).toEqual(new Date('2024-04-01'))
    expect(result.dueAt).toEqual(new Date('2024-05-01'))
  })

  it('maps created_at to createdAt Date', () => {
    expect(transformInvoice(makeReceivable()).createdAt).toEqual(new Date('2024-04-01T12:00:00Z'))
  })

  describe('status mapping', () => {
    it('maps needs_approval to AUTHORIZED', () => {
      expect(transformInvoice(makeReceivable({ status: 'needs_approval' })).status).toBe(
        'AUTHORIZED',
      )
    })

    it('maps ready_to_send to AUTHORIZED', () => {
      expect(transformInvoice(makeReceivable({ status: 'ready_to_send' })).status).toBe(
        'AUTHORIZED',
      )
    })

    it('maps scheduled to AUTHORIZED', () => {
      expect(transformInvoice(makeReceivable({ status: 'scheduled' })).status).toBe('AUTHORIZED')
    })

    it('maps pending to SUBMITTED', () => {
      expect(transformInvoice(makeReceivable({ status: 'pending' })).status).toBe('SUBMITTED')
    })

    it('maps processing to SUBMITTED', () => {
      expect(transformInvoice(makeReceivable({ status: 'processing' })).status).toBe('SUBMITTED')
    })

    it('maps initiated to SUBMITTED', () => {
      expect(transformInvoice(makeReceivable({ status: 'initiated' })).status).toBe('SUBMITTED')
    })

    it('maps completed to PAID', () => {
      expect(transformInvoice(makeReceivable({ status: 'completed' })).status).toBe('PAID')
    })

    it('maps externally_paid to PAID', () => {
      expect(transformInvoice(makeReceivable({ status: 'externally_paid' })).status).toBe('PAID')
    })

    it('maps issue to OVERDUE', () => {
      expect(transformInvoice(makeReceivable({ status: 'issue' })).status).toBe('OVERDUE')
    })

    it('maps failed to OVERDUE', () => {
      expect(transformInvoice(makeReceivable({ status: 'failed' })).status).toBe('OVERDUE')
    })

    it('maps canceled to VOIDED', () => {
      expect(transformInvoice(makeReceivable({ status: 'canceled' })).status).toBe('VOIDED')
    })

    it('maps unknown status to DRAFT', () => {
      expect(transformInvoice(makeReceivable({ status: undefined })).status).toBe('DRAFT')
    })
  })

  describe('line items', () => {
    it('maps line_items to lineItems with correct field mappings', () => {
      const result = transformInvoice(makeReceivable())
      expect(result.lineItems).toHaveLength(1)
      const li = result.lineItems![0]
      expect(li.id).toBe('li_inv_001')
      expect(li.itemDescription).toBe('Product license')
      expect(li.unitAmount).toBe(5000) // '50.00' × 100
      expect(li.unitQuantity).toBe(3)
      expect(li.totalAmount).toBe(15000) // '150.00' × 100
    })

    it('produces empty lineItems array when line_items is absent', () => {
      const result = transformInvoice(makeReceivable({ line_items: undefined }))
      expect(result.lineItems).toEqual([])
    })
  })

  it('passes raw object as metadata (reference equality)', () => {
    const raw = makeReceivable()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('passes InvoiceSchema.parse without throwing', () => {
    const result = transformInvoice(makeReceivable())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})

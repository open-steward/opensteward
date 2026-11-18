import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import {
  transformInvoice,
  type MisaAmisInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/misaamis/transform/invoice'

function makeRaw(overrides: Partial<MisaAmisInvoice> = {}): MisaAmisInvoice {
  return {
    id: 'inv-001',
    invoice_number: 'INV-2024-001',
    invoice_date: '2024-03-01',
    due_date: '2024-03-31',
    total_amount: 1000000,
    vat_amount: 100000,
    total_payment: 1100000,
    remaining_amount: 1100000,
    currency_code: 'VND',
    partner_id: 'partner-001',
    partner_name: 'Công ty ABC',
    status: 0,
    invoice_details: [],
    ...overrides,
  }
}

describe('transformInvoice (misaamis)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeRaw())
    expect(result.id).toBe('inv-001')
    expect(result.invoiceNumber).toBe('INV-2024-001')
    expect(result.contactId).toBe('partner-001')
    expect(result.currency).toBe('VND')
    expect(result.totalAmount).toBe(1100000)
    expect(result.taxAmount).toBe(100000)
    expect(result.balanceAmount).toBe(1100000)
    expect(result.type).toBe('INVOICE')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
    expect(result.dueAt).toEqual(new Date('2024-03-31'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw({ invoice_number: 'INV-META-001' })
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps status 0 to DRAFT', () => {
    expect(transformInvoice(makeRaw({ status: 0 })).status).toBe('DRAFT')
  })

  it('maps status 1 to AUTHORIZED', () => {
    expect(transformInvoice(makeRaw({ status: 1 })).status).toBe('AUTHORIZED')
  })

  it('maps status 2 to PAID', () => {
    expect(transformInvoice(makeRaw({ status: 2 })).status).toBe('PAID')
  })

  it('maps status 3 to VOIDED', () => {
    expect(transformInvoice(makeRaw({ status: 3 })).status).toBe('VOIDED')
  })

  it('maps status 4 to PARTIALLY_PAID', () => {
    expect(transformInvoice(makeRaw({ status: 4 })).status).toBe('PARTIALLY_PAID')
  })

  it('maps invoice_details to lineItems', () => {
    const raw = makeRaw({
      invoice_details: [
        {
          id: 'detail-001',
          description: 'Dịch vụ tư vấn',
          unit: 'buổi',
          quantity: 2,
          unit_price: 500000,
          amount: 1000000,
          vat_rate: 10,
          vat_amount: 100000,
          account_id: 'acc-001',
          account_code: '5111',
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('detail-001')
    expect(li.itemDescription).toBe('Dịch vụ tư vấn')
    expect(li.unitAmount).toBe(500000)
    expect(li.unitQuantity).toBe(2)
    expect(li.totalAmount).toBe(1000000)
    expect(li.taxAmount).toBe(100000)
    expect(li.accountId).toBe('acc-001')
  })

  it('handles missing invoice_details gracefully', () => {
    const raw = makeRaw()
    raw.invoice_details = []
    const result = transformInvoice(raw)
    expect(result.lineItems).toEqual([])
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeRaw())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})

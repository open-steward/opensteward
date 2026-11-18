import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type KingdeeInvoice } from '../../../../../../../src/verticals/accounting/adapters/kingdee/transform/invoice'

function makeInvoice(overrides: Partial<KingdeeInvoice> = {}): KingdeeInvoice {
  return {
    id: 'kd-001',
    billNo: 'KD-2024-001',
    billDate: '2024-01-15',
    dueDate: '2024-02-15',
    totalAmount: 1230,
    taxAmount: 230,
    status: 'A',
    custId: 'cust-42',
    currId: 'CNY',
    lines: [],
    ...overrides,
  }
}

describe('transformInvoice (kingdee)', () => {
  it('maps id from id field', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('kd-001')
  })

  it('maps id from billId when id is missing', () => {
    expect(transformInvoice(makeInvoice({ id: undefined, billId: 'bd-001' })).id).toBe('bd-001')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('maps invoice number from billNo', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('KD-2024-001')
  })

  it('maps total amount from totalAmount', () => {
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(1230)
  })

  it('maps tax amount from taxAmount', () => {
    expect(transformInvoice(makeInvoice()).taxAmount).toBe(230)
  })

  it('maps AUTHORIZED status for A', () => {
    expect(transformInvoice(makeInvoice({ status: 'A' })).status).toBe('AUTHORIZED')
  })

  it('maps PAID status for B', () => {
    expect(transformInvoice(makeInvoice({ status: 'B' })).status).toBe('PAID')
  })

  it('maps VOIDED status for C', () => {
    expect(transformInvoice(makeInvoice({ status: 'C' })).status).toBe('VOIDED')
  })

  it('maps DRAFT status for unknown', () => {
    expect(transformInvoice(makeInvoice({ status: 'X' })).status).toBe('DRAFT')
  })

  it('maps contactId from custId', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('cust-42')
  })

  it('maps currency from currId', () => {
    expect(transformInvoice(makeInvoice()).currency).toBe('CNY')
  })

  it('metadata identity', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})

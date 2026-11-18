import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import {
  transformInvoice,
  type IntacctInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/sageintacct/transform/invoice'

function makeInvoice(overrides: Partial<IntacctInvoice> = {}): IntacctInvoice {
  return {
    RECORDNO: 'inv-1',
    RECORDID: 'INV-2024-001',
    CUSTOMERID: 'cust-1',
    TOTALENTERED: '1000.00',
    TOTALPAID: '0.00',
    TOTALDUE: '1000.00',
    CURRENCY: 'USD',
    WHENCREATED: '2024-03-01',
    WHENDUE: '2024-04-01',
    STATE: 'Posted',
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps RECORDNO to id', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('inv-1')
  })

  it('maps RECORDID to invoiceNumber', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('INV-2024-001')
  })

  it('maps CUSTOMERID to contactId', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('cust-1')
  })

  it('maps CURRENCY correctly', () => {
    expect(transformInvoice(makeInvoice()).currency).toBe('USD')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('parses TOTALENTERED as totalAmount', () => {
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(1000)
  })

  it('parses TOTALPAID as paidAmount', () => {
    expect(transformInvoice(makeInvoice()).paidAmount).toBe(0)
  })

  it('parses TOTALDUE as balanceAmount', () => {
    expect(transformInvoice(makeInvoice()).balanceAmount).toBe(1000)
  })

  it('parses WHENCREATED as Date', () => {
    expect(transformInvoice(makeInvoice()).postedAt).toEqual(new Date('2024-03-01'))
  })

  it('parses WHENDUE as Date', () => {
    expect(transformInvoice(makeInvoice()).dueAt).toEqual(new Date('2024-04-01'))
  })

  it('maps STATE Draft to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ STATE: 'Draft' })).status).toBe('DRAFT')
  })

  it('maps STATE Posted with full balance due to AUTHORIZED', () => {
    expect(
      transformInvoice(makeInvoice({ STATE: 'Posted', TOTALPAID: '0.00', TOTALDUE: '1000.00' })).status,
    ).toBe('AUTHORIZED')
  })

  it('maps STATE Posted with zero due to PAID', () => {
    expect(
      transformInvoice(makeInvoice({ STATE: 'Posted', TOTALPAID: '1000.00', TOTALDUE: '0.00' })).status,
    ).toBe('PAID')
  })

  it('maps STATE Posted with partial payment to PARTIALLY_PAID', () => {
    expect(
      transformInvoice(makeInvoice({ STATE: 'Posted', TOTALPAID: '600.00', TOTALDUE: '400.00' })).status,
    ).toBe('PARTIALLY_PAID')
  })

  it('maps STATE Paid to PAID', () => {
    expect(transformInvoice(makeInvoice({ STATE: 'Paid' })).status).toBe('PAID')
  })

  it('maps STATE Reversed to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ STATE: 'Reversed' })).status).toBe('VOIDED')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})

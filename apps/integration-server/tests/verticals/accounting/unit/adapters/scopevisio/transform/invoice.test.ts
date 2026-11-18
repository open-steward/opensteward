import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  type ScopevisioOutgoingInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/scopevisio/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'

const EPOCH_MS = 1704067200000 // 2024-01-01T00:00:00.000Z

function makeRaw(overrides: Partial<ScopevisioOutgoingInvoice> = {}): ScopevisioOutgoingInvoice {
  return {
    id: 99,
    documentNumber: 'RE-2024-0099',
    status: 'POSTED',
    customerContactId: 12,
    currency: 'EUR',
    totalGross: 11900,
    totalNet: 10000,
    totalVat: 1900,
    openAmount: 11900,
    isPaid: false,
    orderNumber: 'ORD-001',
    documentDate: EPOCH_MS,
    dueDate: EPOCH_MS + 30 * 86400000,
    documentText: 'Invoice for consulting services',
    positions: [
      {
        id: 1,
        name: 'Consulting',
        quantity: 10,
        unitPrice: 1000,
        totalGross: 11900,
        totalVat: 1900,
        accountNumber: '8400',
      },
    ],
    ...overrides,
  }
}

describe('transformInvoice (scopevisio)', () => {
  it('maps documentNumber to id', () => {
    expect(transformInvoice(makeRaw()).id).toBe('RE-2024-0099')
  })

  it('maps documentNumber to invoiceNumber', () => {
    expect(transformInvoice(makeRaw()).invoiceNumber).toBe('RE-2024-0099')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeRaw()).type).toBe('INVOICE')
  })

  it('maps customerContactId to contactId string', () => {
    expect(transformInvoice(makeRaw()).contactId).toBe('12')
  })

  it('maps totalGross to totalAmount', () => {
    expect(transformInvoice(makeRaw()).totalAmount).toBe(11900)
  })

  it('maps totalVat to taxAmount', () => {
    expect(transformInvoice(makeRaw()).taxAmount).toBe(1900)
  })

  it('maps openAmount to balanceAmount', () => {
    expect(transformInvoice(makeRaw()).balanceAmount).toBe(11900)
  })

  it('maps orderNumber to reference', () => {
    expect(transformInvoice(makeRaw()).reference).toBe('ORD-001')
  })

  it('converts documentDate epoch ms to Date', () => {
    expect(transformInvoice(makeRaw()).postedAt).toEqual(new Date(EPOCH_MS))
  })

  it('maps POSTED + openAmount=totalGross to AUTHORIZED', () => {
    expect(transformInvoice(makeRaw()).status).toBe('AUTHORIZED')
  })

  it('maps POSTED + openAmount=0 to PAID', () => {
    expect(transformInvoice(makeRaw({ openAmount: 0 })).status).toBe('PAID')
  })

  it('maps POSTED + partial openAmount to PARTIALLY_PAID', () => {
    expect(transformInvoice(makeRaw({ openAmount: 5000 })).status).toBe('PARTIALLY_PAID')
  })

  it('maps CANCELLED to VOIDED', () => {
    expect(transformInvoice(makeRaw({ status: 'CANCELLED' })).status).toBe('VOIDED')
  })

  it('maps STORNIERT to VOIDED', () => {
    expect(transformInvoice(makeRaw({ status: 'STORNIERT' })).status).toBe('VOIDED')
  })

  it('maps isPaid=true to PAID', () => {
    expect(transformInvoice(makeRaw({ isPaid: true })).status).toBe('PAID')
  })

  it('maps positions to lineItems', () => {
    const result = transformInvoice(makeRaw())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].itemName).toBe('Consulting')
    expect(result.lineItems![0].unitQuantity).toBe(10)
    expect(result.lineItems![0].accountId).toBe('8400')
  })

  it('passes InvoiceSchema.parse without throwing', () => {
    expect(() => InvoiceSchema.parse(transformInvoice(makeRaw()))).not.toThrow()
  })
})

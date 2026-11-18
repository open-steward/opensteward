import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import {
  transformInvoice,
  type SpeedLedgerInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/speedledger/transform/invoice'

function makeInvoice(overrides: Partial<SpeedLedgerInvoice> = {}): SpeedLedgerInvoice {
  return {
    id: 201,
    invoiceNumber: 'SL-001',
    invoiceDate: '2024-05-01',
    dueDate: '2024-05-31',
    totalExclVat: 10000,
    totalVat: 2500,
    totalInclVat: 12500,
    balance: 12500,
    status: 'SENT',
    contactId: 77,
    currency: 'SEK',
    lines: [],
    ...overrides,
  }
}

describe('transformInvoice (SpeedLedger)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('201')
    expect(result.invoiceNumber).toBe('SL-001')
    expect(result.contactId).toBe('77')
    expect(result.totalAmount).toBe(12500)
    expect(result.taxAmount).toBe(2500)
    expect(result.balanceAmount).toBe(12500)
    expect(result.currency).toBe('SEK')
    expect(result.type).toBe('INVOICE')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-05-01'))
    expect(result.dueAt).toEqual(new Date('2024-05-31'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeInvoice()
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps SENT status to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ status: 'SENT' })).status).toBe('AUTHORIZED')
  })

  it('maps PAID status to PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 'PAID' })).status).toBe('PAID')
  })

  it('maps CANCELLED status to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ status: 'CANCELLED' })).status).toBe('VOIDED')
  })

  it('maps DRAFT status to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ status: 'DRAFT' })).status).toBe('DRAFT')
  })

  it('maps line items correctly', () => {
    const raw = makeInvoice({
      lines: [
        {
          id: 10,
          description: 'Consultation',
          quantity: 3,
          unitPrice: 800,
          amount: 2400,
          vatAmount: 600,
          accountNumber: '3000',
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('10')
    expect(li.itemDescription).toBe('Consultation')
    expect(li.unitAmount).toBe(800)
    expect(li.unitQuantity).toBe(3)
    expect(li.totalAmount).toBe(2400)
    expect(li.taxAmount).toBe(600)
    expect(li.accountId).toBe('3000')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})

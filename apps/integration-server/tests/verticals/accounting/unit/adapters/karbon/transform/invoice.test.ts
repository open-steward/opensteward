import { describe, it, expect } from 'vitest'
import { expectDate } from '../../../../../../date-assertions'
import {
  transformInvoice,
  type KarbonInvoice,
  type KarbonInvoiceLineItem,
} from '../../../../../../../src/verticals/accounting/adapters/karbon/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'

function makeInvoice(overrides: Partial<KarbonInvoice> = {}): KarbonInvoice {
  return {
    InvoiceKey: 'inv-001',
    InvoiceNumber: 'INV-2024-001',
    InvoiceTotal: 12000,
    InvoiceTaxTotal: 1000,
    InvoiceSubTotal: 11000,
    TotalAmountDue: 12000,
    InvoiceDate: '2024-01-15T00:00:00.000Z',
    PaymentDueDate: '2024-02-15T00:00:00.000Z',
    CreatedAt: '2024-01-10T09:00:00.000Z',
    UpdatedAt: '2024-01-16T08:00:00.000Z',
    CurrencyCode: 'USD',
    PaymentInstructions: 'Pay by bank transfer',
    InvoiceStatus: 'approved',
    Client: {
      ClientKey: 'client-001',
      Name: 'Acme Corp',
    },
    LineItems: [],
    Payments: [],
    ...overrides,
  }
}

function makeLineItem(overrides: Partial<KarbonInvoiceLineItem> = {}): KarbonInvoiceLineItem {
  return {
    LineItemKey: 'li-001',
    Description: 'Consulting services',
    Quantity: 2,
    UnitPrice: '5500',
    Amount: 11000,
    TaxRate: 10,
    ...overrides,
  }
}

// ── transformInvoice ──────────────────────────────────────────────────────────

describe('transformInvoice', () => {
  it('maps InvoiceKey to id', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('inv-001')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('maps InvoiceNumber to invoiceNumber', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('INV-2024-001')
  })

  it('maps Client.ClientKey to contactId', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('client-001')
  })

  it('maps CurrencyCode to currency', () => {
    expect(transformInvoice(makeInvoice()).currency).toBe('USD')
  })

  it('maps InvoiceTotal to totalAmount', () => {
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(12000)
  })

  it('maps InvoiceTaxTotal to taxAmount', () => {
    expect(transformInvoice(makeInvoice()).taxAmount).toBe(1000)
  })

  it('maps TotalAmountDue to balanceAmount', () => {
    expect(transformInvoice(makeInvoice()).balanceAmount).toBe(12000)
  })

  it('maps PaymentInstructions to notes', () => {
    expect(transformInvoice(makeInvoice()).notes).toBe('Pay by bank transfer')
  })

  it('sums Payments.Amount as paidAmount', () => {
    const inv = makeInvoice({
      Payments: [
        { PaymentKey: 'p1', Amount: 5000 },
        { PaymentKey: 'p2', Amount: 3000 },
      ],
    })
    expect(transformInvoice(inv).paidAmount).toBe(8000)
  })

  it('derives balanceAmount from total minus paid when TotalAmountDue is absent', () => {
    const inv = makeInvoice({
      TotalAmountDue: undefined,
      InvoiceTotal: 12000,
      Payments: [{ PaymentKey: 'p1', Amount: 4000 }],
    })
    expect(transformInvoice(inv).balanceAmount).toBe(8000)
  })

  it('maps InvoiceDate to postedAt as a Date', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toBeInstanceOf(Date)
    expect(expectDate(result.postedAt).toISOString()).toBe('2024-01-15T00:00:00.000Z')
  })

  it('maps PaymentDueDate to dueAt as a Date', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.dueAt).toBeInstanceOf(Date)
    expect(expectDate(result.dueAt).toISOString()).toBe('2024-02-15T00:00:00.000Z')
  })

  it('maps CreatedAt to createdAt as a Date', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.createdAt?.toISOString()).toBe('2024-01-10T09:00:00.000Z')
  })

  it('maps UpdatedAt to updatedAt as a Date', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.updatedAt).toBeInstanceOf(Date)
    expect(result.updatedAt?.toISOString()).toBe('2024-01-16T08:00:00.000Z')
  })

  it('produces undefined date fields when dates are absent', () => {
    const result = transformInvoice(
      makeInvoice({
        InvoiceDate: undefined,
        PaymentDueDate: undefined,
        CreatedAt: undefined,
        UpdatedAt: undefined,
      }),
    )
    expect(result.postedAt).toBeUndefined()
    expect(result.dueAt).toBeUndefined()
    expect(result.createdAt).toBeUndefined()
    expect(result.updatedAt).toBeUndefined()
  })

  it('passes the raw object as metadata', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  // ── Status mapping ──────────────────────────────────────────────────────────

  it.each([
    ['approved', 'AUTHORIZED'],
    ['APPROVED', 'AUTHORIZED'],
    ['awaitingpayment', 'AUTHORIZED'],
    ['AwaitingPayment', 'AUTHORIZED'],
    ['paid', 'PAID'],
    ['PAID', 'PAID'],
    ['exported', 'PAID'],
    ['voided', 'VOIDED'],
    ['VOIDED', 'VOIDED'],
    ['unknown-status', 'DRAFT'],
    [undefined, 'DRAFT'],
  ] as const)('maps status %s → %s', (raw, expected) => {
    const result = transformInvoice(makeInvoice({ InvoiceStatus: raw as string | undefined }))
    expect(result.status).toBe(expected)
  })

  // ── Line item transform ─────────────────────────────────────────────────────

  it('maps LineItemKey and Description', () => {
    const inv = makeInvoice({ LineItems: [makeLineItem()] })
    const li = transformInvoice(inv).lineItems?.[0]
    expect(li?.id).toBe('li-001')
    expect(li?.itemDescription).toBe('Consulting services')
  })

  it('converts string UnitPrice to number', () => {
    const inv = makeInvoice({ LineItems: [makeLineItem({ UnitPrice: '5500' })] })
    const li = transformInvoice(inv).lineItems?.[0]
    expect(li?.unitAmount).toBe(5500)
  })

  it('accepts numeric UnitPrice', () => {
    const inv = makeInvoice({ LineItems: [makeLineItem({ UnitPrice: 75.5 })] })
    const li = transformInvoice(inv).lineItems?.[0]
    expect(li?.unitAmount).toBe(75.5)
  })

  it('rounds Quantity to unitQuantity', () => {
    const inv = makeInvoice({ LineItems: [makeLineItem({ Quantity: 2.7 })] })
    const li = transformInvoice(inv).lineItems?.[0]
    expect(li?.unitQuantity).toBe(3)
  })

  it('maps Amount to line item totalAmount', () => {
    const inv = makeInvoice({ LineItems: [makeLineItem({ Amount: 11000 })] })
    const li = transformInvoice(inv).lineItems?.[0]
    expect(li?.totalAmount).toBe(11000)
  })

  it('calculates inclusive tax: round(Amount * TaxRate / (100 + TaxRate))', () => {
    // 11000 * 10 / 110 = 1000
    const inv = makeInvoice({ LineItems: [makeLineItem({ Amount: 11000, TaxRate: 10 })] })
    const li = transformInvoice(inv).lineItems?.[0]
    expect(li?.taxAmount).toBe(1000)
  })

  it('sets line item taxAmount to undefined when TaxRate is absent', () => {
    const inv = makeInvoice({ LineItems: [makeLineItem({ TaxRate: undefined })] })
    const li = transformInvoice(inv).lineItems?.[0]
    expect(li?.taxAmount).toBeUndefined()
  })

  it('produces a schema-valid result', () => {
    const inv = makeInvoice({ LineItems: [makeLineItem()] })
    expect(() => InvoiceSchema.parse(transformInvoice(inv))).not.toThrow()
  })

  it('produces a schema-valid result with minimal input', () => {
    const minimal: KarbonInvoice = { InvoiceKey: 'inv-min' }
    expect(() => InvoiceSchema.parse(transformInvoice(minimal))).not.toThrow()
  })
})

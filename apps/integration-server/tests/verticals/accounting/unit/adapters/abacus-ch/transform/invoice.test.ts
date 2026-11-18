import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  untransformInvoice,
  type AbacusInvoice,
  type AbacusInvoicePosition,
} from '../../../../../../../src/verticals/accounting/adapters/abacus-ch/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'

function makePosition(overrides: Partial<AbacusInvoicePosition> = {}): AbacusInvoicePosition {
  return {
    Id: '1',
    ArticleId: '100',
    ArticleNumber: 'SKU-001',
    Description: 'Widget',
    Quantity: 2,
    UnitPrice: 50.0,
    TotalPrice: 100.0,
    TaxAmount: 7.7,
    DiscountAmount: 0,
    ...overrides,
  }
}

function makeAbacusInvoice(overrides: Partial<AbacusInvoice> = {}): AbacusInvoice {
  return {
    Id: '3001',
    InvoiceNumber: 'INV-3001',
    CustomerId: '200',
    InvoiceDate: '2024-02-01',
    DueDate: '2024-03-03',
    TotalAmount: 100.0,
    OpenAmount: 0,
    PaidAmount: 100.0,
    TaxAmount: 7.7,
    DiscountAmount: 0,
    CurrencyCode: 'CHF',
    Status: 'paid',
    Notes: 'Thank you',
    Positions: [makePosition()],
    CreatedAt: '2024-02-01T00:00:00.000Z',
    ModifiedAt: '2024-02-20T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformInvoice (abacus-ch)', () => {
  it('maps Id as string', () => {
    const result = transformInvoice(makeAbacusInvoice({ Id: 3001 }))
    expect(result.id).toBe('3001')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeAbacusInvoice()).type).toBe('INVOICE')
  })

  it('maps InvoiceNumber and CustomerId', () => {
    const result = transformInvoice(makeAbacusInvoice())
    expect(result.invoiceNumber).toBe('INV-3001')
    expect(result.contactId).toBe('200')
  })

  it('converts TotalAmount to minor units', () => {
    const result = transformInvoice(makeAbacusInvoice({ TotalAmount: 100.0 }))
    expect(result.totalAmount).toBe(10000)
  })

  it('converts PaidAmount to minor units', () => {
    const result = transformInvoice(makeAbacusInvoice({ PaidAmount: 100.0 }))
    expect(result.paidAmount).toBe(10000)
  })

  it('converts OpenAmount (balance) to minor units', () => {
    const result = transformInvoice(makeAbacusInvoice({ OpenAmount: 50.0 }))
    expect(result.balanceAmount).toBe(5000)
  })

  it('maps status PAID for "paid"', () => {
    expect(transformInvoice(makeAbacusInvoice({ Status: 'paid' })).status).toBe('PAID')
  })

  it('maps German bezahlt to PAID', () => {
    expect(transformInvoice(makeAbacusInvoice({ Status: 'bezahlt' })).status).toBe('PAID')
  })

  it('maps "draft" to DRAFT', () => {
    expect(transformInvoice(makeAbacusInvoice({ Status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps German entwurf to DRAFT', () => {
    expect(transformInvoice(makeAbacusInvoice({ Status: 'entwurf' })).status).toBe('DRAFT')
  })

  it('maps storniert to VOIDED', () => {
    expect(transformInvoice(makeAbacusInvoice({ Status: 'storniert' })).status).toBe('VOIDED')
  })

  it('derives PARTIALLY_PAID from balance when status is unrecognised', () => {
    const result = transformInvoice(
      makeAbacusInvoice({ Status: '', TotalAmount: 100, OpenAmount: 50 }),
    )
    expect(result.status).toBe('PARTIALLY_PAID')
  })

  it('maps line items with minor-unit conversion', () => {
    const result = transformInvoice(makeAbacusInvoice())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('1')
    expect(li.itemSku).toBe('SKU-001')
    expect(li.unitAmount).toBe(5000) // 50.0 * 100
    expect(li.totalAmount).toBe(10000) // 100.0 * 100
    expect(li.taxAmount).toBe(770) // 7.7 * 100
  })

  it('maps InvoiceDate to postedAt and DueDate to dueAt', () => {
    const result = transformInvoice(makeAbacusInvoice())
    expect(result.postedAt).toBeInstanceOf(Date)
    expect(result.dueAt).toBeInstanceOf(Date)
  })

  it('passes InvoiceSchema.parse without throwing', () => {
    const result = transformInvoice(makeAbacusInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  describe('untransformInvoice', () => {
    it('round-trips invoiceNumber, currency, contactId', () => {
      const invoice = transformInvoice(makeAbacusInvoice())
      const back = untransformInvoice(invoice)
      expect(back.InvoiceNumber).toBe('INV-3001')
      expect(back.CurrencyCode).toBe('CHF')
      // contactId '200' → Number('200') = 200
      expect(back.CustomerId).toBe(200)
    })

    it('converts minor-unit UnitPrice back to decimal', () => {
      const invoice = transformInvoice(makeAbacusInvoice())
      const back = untransformInvoice(invoice)
      const line = (back.Positions as Array<Record<string, unknown>>)[0]
      // unitAmount 5000 / 100 = 50
      expect(line.UnitPrice).toBe(50)
    })

    it('converts InvoiceDate back to date string', () => {
      const invoice = transformInvoice(makeAbacusInvoice())
      const back = untransformInvoice(invoice)
      // postedAt = new Date('2024-02-01') → ISO split by T → '2024-02-01'
      expect(back.InvoiceDate).toBe('2024-02-01')
    })
  })
})

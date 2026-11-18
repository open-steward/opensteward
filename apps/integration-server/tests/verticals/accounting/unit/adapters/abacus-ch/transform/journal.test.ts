import { describe, it, expect } from 'vitest'
import {
  transformJournal,
  type AbacusJournal,
} from '../../../../../../../src/verticals/accounting/adapters/abacus-ch/transform/journal'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'

function makeAbacusJournal(overrides: Partial<AbacusJournal> = {}): AbacusJournal {
  return {
    Id: '6001',
    Description: 'Monthly accrual',
    Reference: 'REF-2024-02',
    Source: 'ERP',
    CurrencyCode: 'CHF',
    TaxAmount: 10.0,
    TaxCodeId: '10',
    BookingDate: '2024-02-29',
    Positions: [
      {
        Id: '1',
        AccountId: '1000',
        ContactId: '200',
        InvoiceId: '3001',
        Description: 'Revenue posting',
        DebitAmount: 500.0,
        CreditAmount: 0,
        TaxAmount: 10.0,
        TotalAmount: 500.0,
      },
    ],
    CreatedAt: '2024-02-29T00:00:00.000Z',
    ModifiedAt: '2024-02-29T12:00:00.000Z',
    ...overrides,
  }
}

describe('transformJournal (abacus-ch)', () => {
  it('maps Id as string', () => {
    expect(transformJournal(makeAbacusJournal({ Id: 6001 })).id).toBe('6001')
  })

  it('maps Description, Reference, Source', () => {
    const result = transformJournal(makeAbacusJournal())
    expect(result.description).toBe('Monthly accrual')
    expect(result.reference).toBe('REF-2024-02')
    expect(result.source).toBe('ERP')
  })

  it('maps CurrencyCode', () => {
    expect(transformJournal(makeAbacusJournal()).currency).toBe('CHF')
  })

  it('converts TaxAmount to minor units', () => {
    expect(transformJournal(makeAbacusJournal({ TaxAmount: 10.0 })).taxAmount).toBe(1000)
  })

  it('maps TaxCodeId to taxrateId as string', () => {
    expect(transformJournal(makeAbacusJournal()).taxrateId).toBe('10')
  })

  it('maps BookingDate to postedAt', () => {
    expect(transformJournal(makeAbacusJournal()).postedAt).toBeInstanceOf(Date)
  })

  it('maps line item fields with minor-unit conversion', () => {
    const result = transformJournal(makeAbacusJournal())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('1')
    expect(li.accountId).toBe('1000')
    expect(li.contactId).toBe('200')
    expect(li.invoiceId).toBe('3001')
    expect(li.description).toBe('Revenue posting')
    expect(li.debitAmount).toBe(50000) // 500.0 * 100
    expect(li.taxAmount).toBe(1000) // 10.0 * 100
    expect(li.totalAmount).toBe(50000)
  })

  it('maps CreatedAt and ModifiedAt as Date', () => {
    const result = transformJournal(makeAbacusJournal())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('passes JournalSchema.parse without throwing', () => {
    const result = transformJournal(makeAbacusJournal())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})

import { describe, it, expect } from 'vitest'
import { transformQuote, type XeroQuote } from '../../../../../../../src/verticals/accounting/adapters/xero/transform/quote'
import { QuoteSchema } from '../../../../../../../src/verticals/accounting/schema/quote'

/**
 * Xero exposes a real Quotes entity that had nowhere to land: the accounting
 * vertical had no canonical quote resource, so `GET /Quotes` was unreachable
 * even though the endpoint was known-good — the pre-#454 `listOrders` read it
 * and mapped it onto orders, which is why that was repointed to
 * `/PurchaseOrders`.
 */

function makeQuote(overrides: Partial<XeroQuote> = {}): XeroQuote {
  return {
    QuoteID: 'q-1',
    QuoteNumber: 'QU-0042',
    Reference: 'Website redesign',
    Contact: { ContactID: 'c-9' },
    DateString: '2026-02-01T00:00:00',
    ExpiryDateString: '2026-03-03T00:00:00',
    Status: 'SENT',
    CurrencyCode: 'GBP',
    SubTotal: 1150,
    TotalTax: 100,
    Total: 1250,
    LineAmountTypes: 'Exclusive',
    LineItems: [
      {
        LineItemID: 'li-1',
        Description: 'Design',
        UnitAmount: 1150,
        Quantity: 1,
        LineAmount: 1150,
        TaxAmount: 100,
      } as never,
    ],
    UpdatedDateUTC: '/Date(1770000000000+0000)/',
    ...overrides,
  }
}

describe('xero transformQuote', () => {
  it('produces a schema-valid Quote', () => {
    expect(() => QuoteSchema.parse(transformQuote(makeQuote()))).not.toThrow()
  })

  it('converts amounts to minor units', () => {
    const q = transformQuote(makeQuote())
    expect(q.totalAmount).toBe(125000)
    expect(q.subtotalAmount).toBe(115000)
    expect(q.taxAmount).toBe(10000)
  })

  it('maps DELETED, which the old orders-mapped type omitted', () => {
    // That omission made a deleted quote arrive as UNKNOWN.
    expect(transformQuote(makeQuote({ Status: 'DELETED' })).status).toBe('DELETED')
  })

  it.each([
    ['DRAFT', 'DRAFT'],
    ['SENT', 'SENT'],
    ['ACCEPTED', 'ACCEPTED'],
    ['DECLINED', 'DECLINED'],
    ['INVOICED', 'INVOICED'],
  ])('maps %s to %s', (raw, expected) => {
    expect(transformQuote(makeQuote({ Status: raw as never })).status).toBe(expected)
  })

  it('reads ExpiryDate as an expiry, not a due date', () => {
    // Nothing is owed on a quote, so the canonical shape has no dueAt at all.
    const q = transformQuote(makeQuote())
    expect(q.expiresAt).toBeTruthy()
    expect(q).not.toHaveProperty('dueAt')
  })

  it('reports an explicitly empty line-item list as empty, not absent', () => {
    expect(transformQuote(makeQuote({ LineItems: [] })).lineItems).toEqual([])
  })

  it('survives a quote with no line items or optional fields', () => {
    const bare = { QuoteID: 'q-2' } as XeroQuote
    const q = transformQuote(bare)
    expect(q.id).toBe('q-2')
    // null, not [] — Xero omitted the key, which is not the same as reporting
    // an empty list.
    expect(q.lineItems).toBeNull()
    expect(() => QuoteSchema.parse(q)).not.toThrow()
  })
})

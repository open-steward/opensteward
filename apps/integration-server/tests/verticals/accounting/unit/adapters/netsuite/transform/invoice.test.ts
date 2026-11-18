import { describe, it, expect } from 'vitest'
import { transformInvoice, type NetSuiteInvoice, type NetSuiteInvoiceItem } from '../../../../../../../src/verticals/accounting/adapters/netsuite/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'

function makeInvoice(overrides: Partial<NetSuiteInvoice> = {}): NetSuiteInvoice {
  return {
    id: 'ns-inv-001',
    tranId: 'TXN-2024-001',
    entity: { id: 'entity-001', refName: 'Stark Industries' },
    tranDate: '2024-08-01',
    dueDate: '2024-09-01',
    total: 15000,
    amountRemaining: 15000,
    taxTotal: 2500,
    // Shape per Oracle's REST record reference: `id` is the currency record's
    // internal ID, `refName` its display name. Reversing them would let the
    // transform emit a display name into a field the canonical schema
    // validates as /^[A-Z]{3}$/.
    currency: { id: '1', refName: 'USD' },
    status: { id: 'A', refName: 'Open' },
    item: [],
    ...overrides,
  }
}

function makeItem(overrides: Partial<NetSuiteInvoiceItem> = {}): NetSuiteInvoiceItem {
  return {
    item: { id: 'item-001' },
    description: 'Enterprise Plan',
    quantity: 3,
    rate: 4500,
    amount: 13500,
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('ns-inv-001')
    expect(result.type).toBe('INVOICE')
    expect(result.invoiceNumber).toBe('TXN-2024-001')
    expect(result.contactId).toBe('entity-001')
    expect(result.currency).toBe('USD')
    expect(result.totalAmount).toBe(15000)
    expect(result.taxAmount).toBe(2500)
    expect(result.balanceAmount).toBe(15000)
  })

  it('uses currency refName when it is an ISO 4217 code', () => {
    const result = transformInvoice(makeInvoice({ currency: { id: '3', refName: 'EUR' } }))
    expect(result.currency).toBe('EUR')
  })

  it('omits currency when refName is a display name rather than a code', () => {
    // A renamed or localised currency record. Emitting 'US Dollar' here would
    // violate canonical Invoice.currency, and nothing downstream would catch
    // it — the routers validate request bodies only, never responses.
    const result = transformInvoice(makeInvoice({ currency: { id: '1', refName: 'US Dollar' } }))
    expect(result.currency).toBeUndefined()
  })

  it('omits currency when the reference is absent entirely', () => {
    // The SuiteQL list path selects a flat `currency` column rather than the
    // REST record's nested reference, so this member can be missing.
    const result = transformInvoice(makeInvoice({ currency: undefined as never }))
    expect(result.currency).toBeUndefined()
  })

  it('output satisfies the canonical Invoice schema', () => {
    // Schema-parse the result — without this assertion a non-conformant
    // currency value passes unnoticed.
    expect(() => InvoiceSchema.parse(transformInvoice(makeInvoice()))).not.toThrow()
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-08-01'))
    expect(result.dueAt).toEqual(new Date('2024-09-01'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeInvoice()
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps status A to AUTHORIZED', () => {
    const result = transformInvoice(makeInvoice({ status: { id: 'A', refName: 'Open' } }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps status B to PARTIALLY_PAID', () => {
    const result = transformInvoice(makeInvoice({ status: { id: 'B', refName: 'Partially Paid' } }))
    expect(result.status).toBe('PARTIALLY_PAID')
  })

  it('maps status C to PAID', () => {
    const result = transformInvoice(makeInvoice({ status: { id: 'C', refName: 'Paid In Full' } }))
    expect(result.status).toBe('PAID')
  })

  it('maps unknown status to DRAFT', () => {
    const result = transformInvoice(makeInvoice({ status: { id: 'X', refName: 'Unknown' } }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps items to lineItems', () => {
    const raw = makeInvoice({ item: [makeItem()] })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('item-001')
    expect(li.itemId).toBe('item-001')
    expect(li.itemDescription).toBe('Enterprise Plan')
    expect(li.unitAmount).toBe(4500)
    expect(li.unitQuantity).toBe(3)
    expect(li.totalAmount).toBe(13500)
  })

  it('produces empty lineItems when item is absent', () => {
    const raw = makeInvoice({ item: undefined })
    const result = transformInvoice(raw)
    expect(result.lineItems).toEqual([])
  })

  it('omits invoiceNumber when tranId is empty', () => {
    const result = transformInvoice(makeInvoice({ tranId: '' }))
    expect(result.invoiceNumber).toBeUndefined()
  })

  it('omits contactId when entity id is empty', () => {
    const result = transformInvoice(makeInvoice({ entity: { id: '', refName: 'Nobody' } }))
    expect(result.contactId).toBeUndefined()
  })

  it('omits postedAt when tranDate is empty', () => {
    const result = transformInvoice(makeInvoice({ tranDate: '' }))
    expect(result.postedAt).toBeUndefined()
  })

  it('omits dueAt when dueDate is empty', () => {
    const result = transformInvoice(makeInvoice({ dueDate: '' }))
    expect(result.dueAt).toBeUndefined()
  })
})

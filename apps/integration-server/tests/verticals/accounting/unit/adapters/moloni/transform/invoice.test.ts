import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type MoloniInvoice } from '../../../../../../../src/verticals/accounting/adapters/moloni/transform/invoice'

function makeInvoice(overrides: Partial<MoloniInvoice> = {}): MoloniInvoice {
  return {
    document_id: 1001,
    document_set_name: 'FT 2024/1',
    status: 0,
    date: '2024-01-15',
    expiration_date: '2024-02-15',
    net_value: 1000,
    global_discount: 0,
    taxes: [],
    currency_code: 'EUR',
    client_id: 42,
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('1001')
    expect(result.invoiceNumber).toBe('FT 2024/1')
    expect(result.contactId).toBe('42')
    expect(result.totalAmount).toBe(1000)
    expect(result.currency).toBe('EUR')
    expect(result.type).toBe('INVOICE')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
    expect(result.dueAt).toEqual(new Date('2024-02-15'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeInvoice({ document_set_name: 'FT 2024/99' })
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps status 0 to DRAFT', () => {
    const result = transformInvoice(makeInvoice({ status: 0 }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps status 1 to AUTHORIZED', () => {
    const result = transformInvoice(makeInvoice({ status: 1 }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps status 2 to VOIDED', () => {
    const result = transformInvoice(makeInvoice({ status: 2 }))
    expect(result.status).toBe('VOIDED')
  })

  it('sums taxes array for taxAmount', () => {
    const raw = makeInvoice({
      taxes: [{ value: 100 }, { value: 50 }],
    })
    const result = transformInvoice(raw)
    expect(result.taxAmount).toBe(150)
  })

  it('sets taxAmount to undefined when taxes is empty', () => {
    const result = transformInvoice(makeInvoice({ taxes: [] }))
    expect(result.taxAmount).toBeUndefined()
  })

  it('maps global_discount to discountAmount when non-zero', () => {
    const result = transformInvoice(makeInvoice({ global_discount: 50 }))
    expect(result.discountAmount).toBe(50)
  })

  it('maps client_id 0 to undefined contactId', () => {
    const result = transformInvoice(makeInvoice({ client_id: 0 }))
    expect(result.contactId).toBeUndefined()
  })

  it('returns undefined postedAt when date is missing', () => {
    const result = transformInvoice(makeInvoice({ date: '' }))
    expect(result.postedAt).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})

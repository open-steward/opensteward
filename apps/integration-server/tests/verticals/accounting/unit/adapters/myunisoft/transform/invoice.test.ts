import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type MyunisoftInvoice } from '../../../../../../../src/verticals/accounting/adapters/myunisoft/transform/invoice'

function makeInvoice(overrides: Partial<MyunisoftInvoice> = {}): MyunisoftInvoice {
  return {
    id: '50',
    invoice_number: 'MU-2024-050',
    date: '2024-01-20',
    deadline: '2024-02-20',
    ht: 5000,
    tva: 1000,
    ttc: 6000,
    solde: 6000,
    status: 0,
    client_id: 'cl_1',
    devise: 'EUR',
    lignes: [],
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps core fields', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('50')
    expect(result.invoiceNumber).toBe('MU-2024-050')
    expect(result.totalAmount).toBe(6000)
    expect(result.taxAmount).toBe(1000)
    expect(result.balanceAmount).toBe(6000)
    expect(result.currency).toBe('EUR')
    expect(result.type).toBe('INVOICE')
  })

  it('parses dates', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-01-20'))
    expect(result.dueAt).toEqual(new Date('2024-02-20'))
  })

  it('metadata identity', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('maps status 0 to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ status: 0 })).status).toBe('DRAFT')
  })

  it('maps status 1 to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ status: 1 })).status).toBe('AUTHORIZED')
  })

  it('maps status 2 to PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 2 })).status).toBe('PAID')
  })

  it('maps status 3 to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ status: 3 })).status).toBe('VOIDED')
  })

  it('maps lignes to lineItems', () => {
    const raw = makeInvoice({
      lignes: [{ id: 1, description: 'Audit', prix_unitaire: 500, quantite: 10, ht: 5000, tva: 1000, compte_id: '706' }],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].totalAmount).toBe(5000)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})

import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type IpaidthatInvoice } from '../../../../../../../src/verticals/accounting/adapters/ipaidthat/transform/invoice'

function makeInvoice(overrides: Partial<IpaidthatInvoice> = {}): IpaidthatInvoice {
  return {
    id: '60',
    ref: 'IPT-2024-060',
    date: '2024-04-01',
    due_date: '2024-05-01',
    ht: 1500,
    tva: 300,
    ttc: 1800,
    restant: 1800,
    etat: 'brouillon',
    client_id: 'cl_2',
    devise: 'EUR',
    lignes: [],
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps core fields', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('60')
    expect(result.invoiceNumber).toBe('IPT-2024-060')
    expect(result.totalAmount).toBe(1800)
    expect(result.taxAmount).toBe(300)
    expect(result.balanceAmount).toBe(1800)
    expect(result.type).toBe('INVOICE')
  })

  it('parses dates', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-04-01'))
    expect(result.dueAt).toEqual(new Date('2024-05-01'))
  })

  it('metadata identity', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('maps brouillon to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ etat: 'brouillon' })).status).toBe('DRAFT')
  })

  it('maps envoyee to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ etat: 'envoyee' })).status).toBe('AUTHORIZED')
  })

  it('maps payee to PAID', () => {
    expect(transformInvoice(makeInvoice({ etat: 'payee' })).status).toBe('PAID')
  })

  it('maps annulee to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ etat: 'annulee' })).status).toBe('VOIDED')
  })

  it('maps lignes to lineItems', () => {
    const raw = makeInvoice({
      lignes: [{ id: 1, description: 'Conseil', prix_unitaire: 150, quantite: 10, ht: 1500, tva: 300, compte_id: '706' }],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].totalAmount).toBe(1500)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})

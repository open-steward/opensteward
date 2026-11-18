import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type TiimeInvoice } from '../../../../../../../src/verticals/accounting/adapters/tiime/transform/invoice'

function makeInvoice(overrides: Partial<TiimeInvoice> = {}): TiimeInvoice {
  return {
    id: '42',
    numero: 'FA-2024-042',
    date_emission: '2024-01-15',
    date_echeance: '2024-02-15',
    montant_ht: 1000,
    montant_tva: 200,
    montant_ttc: 1200,
    montant_restant: 1200,
    statut: 'brouillon',
    client_id: 'cust_1',
    devise: 'EUR',
    lignes: [],
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('42')
    expect(result.invoiceNumber).toBe('FA-2024-042')
    expect(result.contactId).toBe('cust_1')
    expect(result.totalAmount).toBe(1200)
    expect(result.taxAmount).toBe(200)
    expect(result.balanceAmount).toBe(1200)
    expect(result.currency).toBe('EUR')
    expect(result.type).toBe('INVOICE')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
    expect(result.dueAt).toEqual(new Date('2024-02-15'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeInvoice()
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps brouillon status to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ statut: 'brouillon' })).status).toBe('DRAFT')
  })

  it('maps emis status to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ statut: 'emis' })).status).toBe('AUTHORIZED')
  })

  it('maps paye status to PAID', () => {
    expect(transformInvoice(makeInvoice({ statut: 'paye' })).status).toBe('PAID')
  })

  it('maps annule status to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ statut: 'annule' })).status).toBe('VOIDED')
  })

  it('maps unknown status to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ statut: 'unknown' })).status).toBe('DRAFT')
  })

  it('maps lignes to lineItems', () => {
    const raw = makeInvoice({
      lignes: [
        {
          id: 1,
          description: 'Service conseil',
          prix_unitaire: 500,
          quantite: 2,
          montant_ht: 1000,
          montant_tva: 200,
          compte_id: '706000',
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('1')
    expect(li.itemDescription).toBe('Service conseil')
    expect(li.unitAmount).toBe(500)
    expect(li.unitQuantity).toBe(2)
    expect(li.totalAmount).toBe(1000)
    expect(li.taxAmount).toBe(200)
    expect(li.accountId).toBe('706000')
  })

  it('handles empty lignes', () => {
    const result = transformInvoice(makeInvoice({ lignes: [] }))
    expect(result.lineItems).toHaveLength(0)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})

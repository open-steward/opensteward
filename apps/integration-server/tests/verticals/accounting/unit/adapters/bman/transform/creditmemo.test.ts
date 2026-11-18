import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type BmanNotaCredito } from '../../../../../../../src/verticals/accounting/adapters/bman/transform/creditmemo'

function makeCreditMemo(overrides: Partial<BmanNotaCredito> = {}): BmanNotaCredito {
  return {
    id: 'cm-1',
    numero: 'NC-001',
    data: '2024-01-15',
    scadenza: '2024-02-15',
    netto: 8000,
    iva: 2000,
    totale: 10000,
    saldo: 10000,
    stato: 'bozza',
    valuta: 'EUR',
    cliente_id: 'customer-1',
    righe: [],
    ...overrides,
  }
}

describe('transformCreditMemo', () => {
  it('maps id field', () => {
    expect(transformCreditMemo(makeCreditMemo()).id).toBe('cm-1')
  })

  it('maps key fields', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.creditmemoNumber).toBe('NC-001')
    expect(result.contactId).toBe('customer-1')
    expect(result.currency).toBe('EUR')
    expect(result.totalAmount).toBe(10000)
    expect(result.taxAmount).toBe(2000)
    expect(result.balanceAmount).toBe(10000)
  })

  it('maps stato=bozza to DRAFT', () => {
    expect(transformCreditMemo(makeCreditMemo({ stato: 'bozza' })).status).toBe('DRAFT')
  })

  it('maps stato=inviata to AUTHORIZED', () => {
    expect(transformCreditMemo(makeCreditMemo({ stato: 'inviata' })).status).toBe('AUTHORIZED')
  })

  it('maps stato=pagata to PAID', () => {
    expect(transformCreditMemo(makeCreditMemo({ stato: 'pagata' })).status).toBe('PAID')
  })

  it('maps stato=annullata to VOIDED', () => {
    expect(transformCreditMemo(makeCreditMemo({ stato: 'annullata' })).status).toBe('VOIDED')
  })

  it('maps date fields as Date objects', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
    expect(result.dueAt).toEqual(new Date('2024-02-15'))
  })

  it('maps righe to lineItems', () => {
    const raw = makeCreditMemo({
      righe: [{ id: 'row-1', descrizione: 'Widget', quantita: 2, prezzo: 100, totale: 200, iva: 40, conto: 'ACC-1' }],
    })
    const result = transformCreditMemo(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('row-1')
    expect(li.itemDescription).toBe('Widget')
    expect(li.unitAmount).toBe(100)
    expect(li.unitQuantity).toBe(2)
    expect(li.totalAmount).toBe(200)
    expect(li.taxAmount).toBe(40)
    expect(li.accountId).toBe('ACC-1')
  })

  it('passes raw object as metadata (reference equality)', () => {
    const raw = makeCreditMemo()
    expect(transformCreditMemo(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})

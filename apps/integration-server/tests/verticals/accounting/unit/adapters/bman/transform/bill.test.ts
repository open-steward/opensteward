import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type BmanFatturaAcquisto } from '../../../../../../../src/verticals/accounting/adapters/bman/transform/bill'

function makeBill(overrides: Partial<BmanFatturaAcquisto> = {}): BmanFatturaAcquisto {
  return {
    id: 'bill-1',
    numero: 'BILL-001',
    data: '2024-01-15',
    scadenza: '2024-02-15',
    netto: 8000,
    iva: 2000,
    totale: 10000,
    saldo: 10000,
    stato: 'bozza',
    valuta: 'EUR',
    fornitore_id: 'supplier-1',
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps id field', () => {
    const result = transformBill(makeBill())
    expect(result.id).toBe('bill-1')
  })

  it('maps key fields', () => {
    const result = transformBill(makeBill())
    expect(result.billNumber).toBe('BILL-001')
    expect(result.contactId).toBe('supplier-1')
    expect(result.currency).toBe('EUR')
    expect(result.totalAmount).toBe(10000)
    expect(result.taxAmount).toBe(2000)
    expect(result.balanceAmount).toBe(10000)
  })

  it('maps stato=bozza to DRAFT', () => {
    expect(transformBill(makeBill({ stato: 'bozza' })).status).toBe('DRAFT')
  })

  it('maps stato=inviata to AUTHORIZED', () => {
    expect(transformBill(makeBill({ stato: 'inviata' })).status).toBe('AUTHORIZED')
  })

  it('maps stato=pagata to PAID', () => {
    expect(transformBill(makeBill({ stato: 'pagata' })).status).toBe('PAID')
  })

  it('maps stato=annullata to VOIDED', () => {
    expect(transformBill(makeBill({ stato: 'annullata' })).status).toBe('VOIDED')
  })

  it('maps date fields as Date objects', () => {
    const result = transformBill(makeBill())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
    expect(result.dueAt).toEqual(new Date('2024-02-15'))
  })

  it('passes raw object as metadata (reference equality)', () => {
    const raw = makeBill()
    expect(transformBill(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeBill())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})

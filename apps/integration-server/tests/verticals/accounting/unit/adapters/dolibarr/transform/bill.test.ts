import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type DolibarrSupplierInvoice } from '../../../../../../../src/verticals/accounting/adapters/dolibarr/transform/bill'

function makeRaw(overrides: Partial<DolibarrSupplierInvoice> = {}): DolibarrSupplierInvoice {
  return {
    id: 5,
    ref: 'FF2024-0001',
    ref_supplier: 'SUP-INV-001',
    status: 1,
    date: 1705276800,
    date_echeance: 1707955200,
    total_ht: 800,
    total_tva: 160,
    total_ttc: 960,
    remaintopay: 960,
    multicurrency_code: 'EUR',
    fk_soc: 12,
    lines: [],
    ...overrides,
  }
}

describe('transformBill (Dolibarr)', () => {
  it('maps core fields correctly', () => {
    const result = transformBill(makeRaw())
    expect(result.id).toBe('5')
    expect(result.billNumber).toBe('FF2024-0001')
    expect(result.contactId).toBe('12')
    expect(result.totalAmount).toBe(960)
    expect(result.taxAmount).toBe(160)
    expect(result.balanceAmount).toBe(960)
    expect(result.currency).toBe('EUR')
  })

  it('maps status 0 to DRAFT', () => {
    expect(transformBill(makeRaw({ status: 0 })).status).toBe('DRAFT')
  })

  it('maps status 1 to SUBMITTED', () => {
    expect(transformBill(makeRaw({ status: 1 })).status).toBe('SUBMITTED')
  })

  it('maps status 2 to AUTHORIZED', () => {
    expect(transformBill(makeRaw({ status: 2 })).status).toBe('AUTHORIZED')
  })

  it('parses unix timestamps as Date objects', () => {
    const result = transformBill(makeRaw())
    expect(result.postedAt).toBeInstanceOf(Date)
    expect(result.dueAt).toBeInstanceOf(Date)
  })

  it('sets metadata to raw object', () => {
    const raw = makeRaw()
    expect(transformBill(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeRaw())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})

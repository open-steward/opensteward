import { describe, it, expect } from 'vitest'
import {
  transformBill,
  type DirectoPurchaseInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/directo/transform/bill'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'

function makeRaw(overrides: Partial<DirectoPurchaseInvoice> = {}): DirectoPurchaseInvoice {
  return {
    number: '1001',
    suppliercode: 'SUPP01',
    supplierinvoiceno: 'INV-2024-001',
    date: '2024-01-15',
    duedate: '2024-02-15',
    currency: 'EUR',
    sum: 121,
    vatsum: 21,
    sumwovat: 100,
    balance: 121,
    status: '',
    rows: [],
    ...overrides,
  }
}

describe('directo transformBill', () => {
  it('maps number to id as string', () => {
    const result = transformBill(makeRaw({ number: 9999 }))
    expect(result.id).toBe('9999')
  })

  it('maps supplierinvoiceno to billNumber', () => {
    const result = transformBill(makeRaw({ supplierinvoiceno: 'EXT-42' }))
    expect(result.billNumber).toBe('EXT-42')
  })

  it('maps suppliercode to contactId', () => {
    const result = transformBill(makeRaw({ suppliercode: 'VEND99' }))
    expect(result.contactId).toBe('VEND99')
  })

  it('status: cancelled → VOIDED', () => {
    const result = transformBill(makeRaw({ status: 'cancelled' }))
    expect(result.status).toBe('VOIDED')
  })

  it('status: balance=0 and sum!=0 → PAID', () => {
    const result = transformBill(makeRaw({ balance: 0, sum: 121 }))
    expect(result.status).toBe('PAID')
  })

  it('status: 0 < balance < sum → PARTIALLY_PAID', () => {
    const result = transformBill(makeRaw({ balance: 50, sum: 121 }))
    expect(result.status).toBe('PARTIALLY_PAID')
  })

  it('status: confirmed → AUTHORIZED', () => {
    const result = transformBill(
      makeRaw({ status: 'confirmed', balance: undefined, sum: undefined }),
    )
    expect(result.status).toBe('AUTHORIZED')
  })

  it('status: default → DRAFT', () => {
    const result = transformBill(makeRaw({ status: '', balance: undefined, sum: undefined }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps date to postedAt as Date', () => {
    const result = transformBill(makeRaw({ date: '2024-03-01' }))
    expect(result.postedAt).toBeInstanceOf(Date)
  })

  it('maps row rn to lineitem id as string', () => {
    const result = transformBill(makeRaw({ rows: [{ rn: 5, account: 'ACC1', sum: 50 }] }))
    expect(result.lineItems?.[0]?.id).toBe('5')
  })

  it('maps currency', () => {
    const result = transformBill(makeRaw({ currency: 'USD' }))
    expect(result.currency).toBe('USD')
  })

  it('metadata is the raw object', () => {
    const raw = makeRaw()
    const result = transformBill(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes BillSchema.parse without throwing', () => {
    const result = transformBill(makeRaw())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})

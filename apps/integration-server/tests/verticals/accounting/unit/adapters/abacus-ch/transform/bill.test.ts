import { describe, it, expect } from 'vitest'
import {
  transformBill,
  type AbacusBill,
} from '../../../../../../../src/verticals/accounting/adapters/abacus-ch/transform/bill'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'

function makeAbacusBill(overrides: Partial<AbacusBill> = {}): AbacusBill {
  return {
    Id: '4001',
    BillNumber: 'BILL-4001',
    CreditorId: '300',
    BillDate: '2024-02-01',
    DueDate: '2024-03-01',
    TotalAmount: 200.0,
    OpenAmount: 0,
    PaidAmount: 200.0,
    TaxAmount: 15.4,
    CurrencyCode: 'CHF',
    Status: 'paid',
    Notes: 'Supplier bill',
    Positions: [],
    CreatedAt: '2024-02-01T00:00:00.000Z',
    ModifiedAt: '2024-02-20T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformBill (abacus-ch)', () => {
  it('maps Id as string', () => {
    expect(transformBill(makeAbacusBill({ Id: 4001 })).id).toBe('4001')
  })

  it('maps BillNumber and CreditorId to contactId', () => {
    const result = transformBill(makeAbacusBill())
    expect(result.billNumber).toBe('BILL-4001')
    expect(result.contactId).toBe('300')
  })

  it('converts TotalAmount to minor units', () => {
    expect(transformBill(makeAbacusBill({ TotalAmount: 200.0 })).totalAmount).toBe(20000)
  })

  it('converts PaidAmount and OpenAmount to minor units', () => {
    const result = transformBill(makeAbacusBill({ PaidAmount: 200.0, OpenAmount: 0 }))
    expect(result.paidAmount).toBe(20000)
    expect(result.balanceAmount).toBe(0)
  })

  it('maps "paid" status to PAID', () => {
    expect(transformBill(makeAbacusBill({ Status: 'paid' })).status).toBe('PAID')
  })

  it('maps "bezahlt" to PAID', () => {
    expect(transformBill(makeAbacusBill({ Status: 'bezahlt' })).status).toBe('PAID')
  })

  it('maps "voided" to VOIDED', () => {
    expect(transformBill(makeAbacusBill({ Status: 'voided' })).status).toBe('VOIDED')
  })

  it('maps "storniert" to VOIDED', () => {
    expect(transformBill(makeAbacusBill({ Status: 'storniert' })).status).toBe('VOIDED')
  })

  it('maps "entwurf" to DRAFT', () => {
    expect(transformBill(makeAbacusBill({ Status: 'entwurf' })).status).toBe('DRAFT')
  })

  it('derives PARTIALLY_PAID from balances when status unrecognised', () => {
    const result = transformBill(
      makeAbacusBill({ Status: '', TotalAmount: 200, OpenAmount: 100, PaidAmount: 100 }),
    )
    expect(result.status).toBe('PARTIALLY_PAID')
  })

  it('maps BillDate to postedAt', () => {
    const result = transformBill(makeAbacusBill())
    expect(result.postedAt).toBeInstanceOf(Date)
  })

  it('maps Notes', () => {
    expect(transformBill(makeAbacusBill({ Notes: 'Test note' })).notes).toBe('Test note')
  })

  it('maps CurrencyCode', () => {
    expect(transformBill(makeAbacusBill({ CurrencyCode: 'EUR' })).currency).toBe('EUR')
  })

  it('passes BillSchema.parse without throwing', () => {
    const result = transformBill(makeAbacusBill())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})

import { describe, it, expect } from 'vitest'
import {
  transformBill,
  type ScopevisioIncomingInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/scopevisio/transform/bill'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'

const EPOCH_MS = 1704067200000 // 2024-01-01T00:00:00.000Z

function makeRaw(overrides: Partial<ScopevisioIncomingInvoice> = {}): ScopevisioIncomingInvoice {
  return {
    id: 42,
    number: 'RE-2024-0042',
    documentNumber: 'SUPP-INV-100',
    status: 'POSTED',
    supplierContactId: 7,
    currency: 'EUR',
    totalGross: 11900,
    totalNet: 10000,
    totalVat: 1900,
    openAmount: 11900,
    isPaid: false,
    receivedDate: EPOCH_MS,
    dueDate: EPOCH_MS + 30 * 86400000,
    ...overrides,
  }
}

describe('transformBill (scopevisio)', () => {
  it('maps number to id', () => {
    expect(transformBill(makeRaw()).id).toBe('RE-2024-0042')
  })

  it('falls back to numeric id when number is absent', () => {
    expect(transformBill(makeRaw({ number: undefined })).id).toBe('42')
  })

  it('maps documentNumber to billNumber', () => {
    expect(transformBill(makeRaw()).billNumber).toBe('SUPP-INV-100')
  })

  it('maps supplierContactId to contactId string', () => {
    expect(transformBill(makeRaw()).contactId).toBe('7')
  })

  it('maps currency', () => {
    expect(transformBill(makeRaw()).currency).toBe('EUR')
  })

  it('maps totalGross to totalAmount', () => {
    expect(transformBill(makeRaw()).totalAmount).toBe(11900)
  })

  it('maps totalVat to taxAmount', () => {
    expect(transformBill(makeRaw()).taxAmount).toBe(1900)
  })

  it('maps openAmount to balanceAmount', () => {
    expect(transformBill(makeRaw()).balanceAmount).toBe(11900)
  })

  it('converts receivedDate epoch ms to Date', () => {
    expect(transformBill(makeRaw()).postedAt).toEqual(new Date(EPOCH_MS))
  })

  it('maps POSTED + openAmount=totalGross to AUTHORIZED', () => {
    expect(transformBill(makeRaw()).status).toBe('AUTHORIZED')
  })

  it('maps POSTED + openAmount=0 to PAID', () => {
    expect(transformBill(makeRaw({ openAmount: 0 })).status).toBe('PAID')
  })

  it('maps CANCELLED to VOIDED', () => {
    expect(transformBill(makeRaw({ status: 'CANCELLED' })).status).toBe('VOIDED')
  })

  it('maps isPaid=true to PAID regardless of status', () => {
    expect(transformBill(makeRaw({ isPaid: true })).status).toBe('PAID')
  })

  it('passes BillSchema.parse without throwing', () => {
    expect(() => BillSchema.parse(transformBill(makeRaw()))).not.toThrow()
  })
})

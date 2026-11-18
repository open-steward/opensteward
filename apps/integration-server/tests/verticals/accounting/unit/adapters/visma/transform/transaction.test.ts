import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type VismaLedgerItem } from '../../../../../../../src/verticals/accounting/adapters/visma/transform/transaction'

function makeLedgerItem(overrides: Partial<VismaLedgerItem> = {}): VismaLedgerItem {
  return {
    Id: 'ledger-uuid-1234',
    CustomerId: 'cust-uuid-5678',
    CustomerNumber: 'C001',
    SupplierId: '',
    SupplierNumber: '',
    InvoiceId: 'inv-uuid-9999',
    InvoiceNumber: 10050,
    Amount: 12500,
    RemainingAmount: 0,
    CurrencyCode: 'SEK',
    PaymentDate: '2024-07-15',
    DueDate: '2024-07-30',
    AccountNumber: 1510,
    Description: 'Invoice payment',
    VoucherNumber: 'V-2024-001',
    CreatedUtc: '2024-07-15T10:00:00Z',
    ModifiedUtc: '2024-07-15T10:00:00Z',
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps core fields', () => {
    const result = transformTransaction(makeLedgerItem())
    expect(result.id).toBe('ledger-uuid-1234')
    expect(result.accountId).toBe('1510')
    expect(result.currency).toBe('SEK')
    expect(result.totalAmount).toBe(12500)
  })

  it('maps invoice number as reference', () => {
    const result = transformTransaction(makeLedgerItem())
    expect(result.reference).toBe('10050')
  })

  it('falls back to voucher number for reference', () => {
    const result = transformTransaction(makeLedgerItem({ InvoiceNumber: 0 }))
    expect(result.reference).toBe('V-2024-001')
  })

  it('maps customer contact', () => {
    const result = transformTransaction(makeLedgerItem())
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts![0].id).toBe('cust-uuid-5678')
  })

  it('maps supplier contact', () => {
    const result = transformTransaction(
      makeLedgerItem({
        CustomerId: '',
        SupplierId: 'supp-uuid-9999',
        SupplierNumber: 'S001',
      }),
    )
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts![0].id).toBe('supp-uuid-9999')
  })

  it('maps payment date as createdAt', () => {
    const result = transformTransaction(makeLedgerItem())
    expect(result.createdAt).toEqual(new Date('2024-07-15'))
  })

  it('maps lineItems', () => {
    const result = transformTransaction(makeLedgerItem())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].accountId).toBe('1510')
    expect(result.lineItems![0].totalAmount).toBe(12500)
  })

  it('passes raw object through as metadata', () => {
    const raw = makeLedgerItem()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeLedgerItem())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})

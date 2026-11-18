import { describe, it, expect } from 'vitest'
import {
  transformAccountingRecordToBill,
  type BrexAccountingRecord,
} from '../../../../../../../src/verticals/accounting/adapters/brex/transform/bill'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'

function makeRecord(overrides: Partial<BrexAccountingRecord> = {}): BrexAccountingRecord {
  return {
    id: 'rec_001',
    review_status: 'READY_FOR_EXPORT',
    amount: { amount: 50000, currency: 'USD' },
    original_amount: { amount: 50000, currency: 'USD' },
    memo: 'Office supplies',
    invoice_number: 'INV-2024-001',
    erp_posting_date: '2024-02-01',
    due_at: '2024-03-01',
    updated_at: '2024-02-05T10:00:00Z',
    posted_at: '2024-01-31T00:00:00Z',
    vendor: { id: 'vendor_001', name: 'Acme Corp', email: 'billing@acme.com' },
    ...overrides,
  }
}

describe('transformAccountingRecordToBill', () => {
  it('maps id', () => {
    expect(transformAccountingRecordToBill(makeRecord()).id).toBe('rec_001')
  })

  it('maps READY_FOR_EXPORT review_status to AUTHORIZED', () => {
    const result = transformAccountingRecordToBill(
      makeRecord({ review_status: 'READY_FOR_EXPORT' }),
    )
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps EXPORTED review_status to PAID', () => {
    const result = transformAccountingRecordToBill(makeRecord({ review_status: 'EXPORTED' }))
    expect(result.status).toBe('PAID')
  })

  it('maps NEEDS_REVIEW review_status to DRAFT', () => {
    const result = transformAccountingRecordToBill(makeRecord({ review_status: 'NEEDS_REVIEW' }))
    expect(result.status).toBe('DRAFT')
  })

  it('returns undefined status for unknown review_status values', () => {
    const result = transformAccountingRecordToBill(
      makeRecord({ review_status: 'SOMETHING_UNKNOWN' }),
    )
    expect(result.status).toBeUndefined()
  })

  it('returns undefined status when review_status is absent', () => {
    const result = transformAccountingRecordToBill(makeRecord({ review_status: undefined }))
    expect(result.status).toBeUndefined()
  })

  it('maps invoice_number to billNumber', () => {
    expect(transformAccountingRecordToBill(makeRecord()).billNumber).toBe('INV-2024-001')
  })

  it('maps vendor.id to contactId', () => {
    expect(transformAccountingRecordToBill(makeRecord()).contactId).toBe('vendor_001')
  })

  it('maps amount.currency to currency', () => {
    expect(transformAccountingRecordToBill(makeRecord()).currency).toBe('USD')
  })

  it('falls back to original_amount.currency when amount is absent', () => {
    const result = transformAccountingRecordToBill(
      makeRecord({ amount: undefined, original_amount: { amount: 50000, currency: 'EUR' } }),
    )
    expect(result.currency).toBe('EUR')
  })

  it('maps amount.amount to totalAmount without conversion', () => {
    expect(transformAccountingRecordToBill(makeRecord()).totalAmount).toBe(50000)
  })

  it('maps memo to notes', () => {
    expect(transformAccountingRecordToBill(makeRecord()).notes).toBe('Office supplies')
  })

  it('prefers erp_posting_date over posted_at for postedAt', () => {
    const result = transformAccountingRecordToBill(makeRecord())
    expect(result.postedAt).toEqual(new Date('2024-02-01'))
  })

  it('falls back to posted_at when erp_posting_date is absent', () => {
    const result = transformAccountingRecordToBill(makeRecord({ erp_posting_date: undefined }))
    expect(result.postedAt).toEqual(new Date('2024-01-31T00:00:00Z'))
  })

  it('postedAt is undefined when both date fields are absent', () => {
    const result = transformAccountingRecordToBill(
      makeRecord({ erp_posting_date: undefined, posted_at: undefined }),
    )
    expect(result.postedAt).toBeUndefined()
  })

  it('maps due_at to dueAt as Date', () => {
    expect(transformAccountingRecordToBill(makeRecord()).dueAt).toEqual(new Date('2024-03-01'))
  })

  it('maps updated_at to updatedAt as Date', () => {
    expect(transformAccountingRecordToBill(makeRecord()).updatedAt).toEqual(
      new Date('2024-02-05T10:00:00Z'),
    )
  })

  it('passes raw object as metadata', () => {
    const raw = makeRecord()
    expect(transformAccountingRecordToBill(raw).metadata).toBe(raw)
  })

  it('produces output that passes BillSchema validation', () => {
    const result = transformAccountingRecordToBill(makeRecord())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })

  it('produces schema-valid output when optional fields are absent', () => {
    const result = transformAccountingRecordToBill(
      makeRecord({
        review_status: undefined,
        amount: undefined,
        original_amount: undefined,
        vendor: undefined,
        invoice_number: undefined,
        memo: undefined,
        erp_posting_date: undefined,
        posted_at: undefined,
        due_at: undefined,
        updated_at: undefined,
      }),
    )
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})

import { describe, it, expect } from 'vitest'
import { expectDate } from '../../../../../../date-assertions'
import {
  transformOrder,
  type MisocaEstimate,
} from '../../../../../../../src/verticals/accounting/adapters/yayoi/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'

function makeRaw(overrides: Partial<MisocaEstimate> = {}): MisocaEstimate {
  return {
    id: 55,
    estimate_number: 'EST-2026-001',
    subject: 'Q1 Project Estimate',
    issue_date: '2026-02-01',
    expire_date: '2026-03-01',
    total_amount: 300000,
    tax_amount: 25000,
    contact_id: 10,
    estimate_status: 'submitted',
    created_at: '2026-01-15T09:30:00.000Z',
    updated_at: '2026-02-01T14:20:00.000Z',
    items: [
      {
        id: 7,
        name: 'Design services',
        quantity: 3,
        unit_price: 90000,
        price: 270000,
      },
    ],
    ...overrides,
  }
}

describe('transformOrder (yayoi)', () => {
  it('maps id to string id', () => {
    expect(transformOrder(makeRaw()).id).toBe('55')
  })

  it('sets type to SALES', () => {
    expect(transformOrder(makeRaw()).type).toBe('SALES')
  })

  it('maps estimate_status submitted to status ACTIVE', () => {
    expect(transformOrder(makeRaw()).status).toBe('ACTIVE')
  })

  it('maps estimate_status accepted to status COMPLETED', () => {
    expect(transformOrder(makeRaw({ estimate_status: 'accepted' })).status).toBe('COMPLETED')
  })

  it('maps estimate_status rejected to status CANCELLED', () => {
    expect(transformOrder(makeRaw({ estimate_status: 'rejected' })).status).toBe('CANCELLED')
  })

  it('maps estimate_status trashed to status CANCELLED', () => {
    expect(transformOrder(makeRaw({ estimate_status: 'trashed' })).status).toBe('CANCELLED')
  })

  it('maps unknown estimate_status to DRAFT', () => {
    expect(transformOrder(makeRaw({ estimate_status: 'unsubmitted' })).status).toBe('DRAFT')
  })

  it('maps contact_id to contactId as string', () => {
    expect(transformOrder(makeRaw()).contactId).toBe('10')
  })

  it('maps total_amount to totalAmount', () => {
    expect(transformOrder(makeRaw()).totalAmount).toBe(300000)
  })

  it('maps issue_date to postedAt', () => {
    const result = transformOrder(makeRaw())
    expect(result.postedAt).toBeInstanceOf(Date)
    expect(expectDate(result.postedAt).toISOString()).toBe('2026-02-01T00:00:00.000Z')
  })

  it('maps line item fields correctly', () => {
    const li = transformOrder(makeRaw()).lineItems?.[0]
    expect(li?.itemDescription).toBe('Design services')
    expect(li?.unitAmount).toBe(90000)
    expect(li?.unitQuantity).toBe(3)
    expect(li?.totalAmount).toBe(270000)
  })

  it('produces a schema-valid Order', () => {
    expect(() => OrderSchema.parse(transformOrder(makeRaw()))).not.toThrow()
  })
})

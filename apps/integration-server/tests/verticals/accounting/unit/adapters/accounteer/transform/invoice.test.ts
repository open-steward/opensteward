import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type AccounteerInvoice } from '../../../../../../../src/verticals/accounting/adapters/accounteer/transform/invoice'

function makeRaw(overrides: Partial<AccounteerInvoice> = {}): AccounteerInvoice {
  return { id: '1', ...overrides }
}

describe('accounteer transformInvoice', () => {
  it('maps id', () => {
    expect(transformInvoice(makeRaw()).id).toBe('1')
  })
  it('handles missing optional fields gracefully', () => {
    expect(() => transformInvoice(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })
  it('maps status sent -> AUTHORIZED', () => {
    expect(transformInvoice(makeRaw({ status: 'sent' })).status).toBe('AUTHORIZED')
  })
  it('maps status paid -> PAID', () => {
    expect(transformInvoice(makeRaw({ status: 'paid' })).status).toBe('PAID')
  })
  it('maps status overdue -> OVERDUE', () => {
    expect(transformInvoice(makeRaw({ status: 'overdue' })).status).toBe('OVERDUE')
  })
  it('maps issue_date to postedAt as Date', () => {
    const result = transformInvoice(makeRaw({ issue_date: '2024-04-01' }))
    expect(result.postedAt).toEqual(new Date('2024-04-01'))
  })
  it('maps contact_id to contactId', () => {
    expect(transformInvoice(makeRaw({ contact_id: '99' })).contactId).toBe('99')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeRaw())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})

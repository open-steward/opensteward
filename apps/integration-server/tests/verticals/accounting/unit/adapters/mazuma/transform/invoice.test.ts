import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type MazumaInvoice } from '../../../../../../../src/verticals/accounting/adapters/mazuma/transform/invoice'

function makeRaw(overrides: Partial<MazumaInvoice> = {}): MazumaInvoice {
  return { id: '1', ...overrides }
}

describe('mazuma transformInvoice', () => {
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
  it('defaults currency to GBP', () => {
    expect(transformInvoice(makeRaw()).currency).toBe('GBP')
  })
  it('maps status paid -> PAID', () => {
    expect(transformInvoice(makeRaw({ status: 'paid' })).status).toBe('PAID')
  })
  it('maps status overdue -> OVERDUE', () => {
    expect(transformInvoice(makeRaw({ status: 'overdue' })).status).toBe('OVERDUE')
  })
  it('maps invoice_date to postedAt as Date', () => {
    expect(transformInvoice(makeRaw({ invoice_date: '2024-04-01' })).postedAt).toEqual(new Date('2024-04-01'))
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeRaw())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})

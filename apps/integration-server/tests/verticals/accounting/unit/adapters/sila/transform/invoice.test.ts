import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type SilaStubInvoice } from '../../../../../../../src/verticals/accounting/adapters/sila/transform/invoice'

function makeRaw(overrides: Partial<SilaStubInvoice> = {}): SilaStubInvoice {
  return { ...overrides }
}

describe('sila transformInvoice', () => {
  it('handles missing optional fields gracefully', () => {
    expect(() => transformInvoice(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeRaw())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})

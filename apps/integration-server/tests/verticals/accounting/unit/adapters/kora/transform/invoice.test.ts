import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type KoraStubInvoice } from '../../../../../../../src/verticals/accounting/adapters/kora/transform/invoice'

function makeRaw(overrides: KoraStubInvoice = {}): KoraStubInvoice {
  return { ...overrides }
}

describe('kora transformInvoice', () => {
  it('handles empty object gracefully', () => {
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

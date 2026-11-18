import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type HinawiContact } from '../../../../../../../src/verticals/accounting/adapters/hinawi/transform/contact'

function makeRaw(overrides: Partial<HinawiContact> = {}): HinawiContact {
  return {
    id: '1',
    Name: 'Gulf Trading LLC',
    Email: 'info@gulf.ae',
    Phone: '+971501234567',
    BillingAddress: { Street: '123 Main St', City: 'Dubai', PostalCode: '00000', Country: 'AE' },
    TaxId: 'TRN12345',
    IsCustomer: true,
    IsVendor: false,
    ...overrides,
  }
}

describe('transformContact (hinawi)', () => {
  it('maps core fields', () => {
    const r = transformContact(makeRaw())
    expect(r.id).toBe('1')
    expect(r.name).toBe('Gulf Trading LLC')
  })

  it('maps email', () => { expect(transformContact(makeRaw()).emails![0].email).toBe('info@gulf.ae') })

  it('maps billing address', () => {
    const r = transformContact(makeRaw())
    expect(r.billingAddress?.address1).toBe('123 Main St')
    expect(r.billingAddress?.city).toBe('Dubai')
  })

  it('maps IsCustomer', () => { expect(transformContact(makeRaw({ IsCustomer: true })).isCustomer).toBe(true) })
  it('maps IsVendor as isSupplier', () => { expect(transformContact(makeRaw({ IsVendor: true })).isSupplier).toBe(true) })
  it('passes metadata unchanged', () => { const raw = makeRaw(); expect(transformContact(raw).metadata).toBe(raw) })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

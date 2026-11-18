import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawApicbaseSupplier,
} from '../../../../../../../src/verticals/inventory/adapters/apicbase/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('apicbase transformSupplier', () => {
  const raw: RawApicbaseSupplier = {
    uid: 'sup-001',
    name: 'Best Foods Ltd',
    email: 'orders@bestfoods.example',
    ordering_email: 'ordering@bestfoods.example',
    phone: '+33123456789',
    vat_number: 'FR123456789',
  }

  it('maps id and externalId from uid', () => {
    const result = transformSupplier(raw)
    expect(result.id).toBe('sup-001')
    expect(result.externalId).toBe('sup-001')
  })

  it('maps name', () => {
    const result = transformSupplier(raw)
    expect(result.name).toBe('Best Foods Ltd')
  })

  it('maps email', () => {
    const result = transformSupplier(raw)
    expect(result.email).toBe('orders@bestfoods.example')
  })

  it('falls back to ordering_email when email is absent', () => {
    const result = transformSupplier({ ...raw, email: undefined })
    expect(result.email).toBe('ordering@bestfoods.example')
  })

  it('maps phone', () => {
    const result = transformSupplier(raw)
    expect(result.phone).toBe('+33123456789')
  })

  it('sets isActive to true', () => {
    const result = transformSupplier(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets platform to apicbase', () => {
    const result = transformSupplier(raw)
    expect(result.platform).toBe('apicbase')
  })

  it('produces output that satisfies SupplierSchema', () => {
    const result = transformSupplier(raw)
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})

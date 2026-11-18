import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawLightspeedSupplier,
} from '../../../../../../../src/verticals/inventory/adapters/lightspeed-inventory/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('lightspeed-inventory transformSupplier', () => {
  const raw: RawLightspeedSupplier = {
    id: 'sup-001',
    name: 'Acme Widgets',
    description: 'Top quality widget supplier',
    source: 'IMPORT',
    deleted_at: null,
    version: 5,
  }

  it('maps id and externalId from id', () => {
    const result = transformSupplier(raw)
    expect(result.id).toBe('sup-001')
    expect(result.externalId).toBe('sup-001')
  })

  it('maps name from name field', () => {
    const result = transformSupplier(raw)
    expect(result.name).toBe('Acme Widgets')
  })

  it('sets isActive true when deleted_at is null', () => {
    const result = transformSupplier(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive false when deleted_at is set', () => {
    const result = transformSupplier({ ...raw, deleted_at: '2024-03-01T00:00:00Z' })
    expect(result.isActive).toBe(false)
  })

  it('leaves email undefined (not exposed by X-Series)', () => {
    const result = transformSupplier(raw)
    expect(result.email).toBeUndefined()
  })

  it('leaves phone undefined (not exposed by X-Series)', () => {
    const result = transformSupplier(raw)
    expect(result.phone).toBeUndefined()
  })

  it('sets platform to lightspeed-inventory', () => {
    const result = transformSupplier(raw)
    expect(result.platform).toBe('lightspeed-inventory')
  })

  it('produces output that satisfies SupplierSchema', () => {
    expect(() => SupplierSchema.parse(transformSupplier(raw))).not.toThrow()
  })
})

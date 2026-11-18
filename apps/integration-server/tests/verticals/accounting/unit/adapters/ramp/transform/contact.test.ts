import { describe, it, expect } from 'vitest'
import {
  transformVendor,
  type RampVendor,
} from '../../../../../../../src/verticals/accounting/adapters/ramp/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeVendor(overrides: Partial<RampVendor> = {}): RampVendor {
  return {
    id: 'vendor_uuid_001',
    remote_id: 'erp_vendor_42',
    name: 'Acme Corp',
    is_active: true,
    is_synced: true,
    accounting_connection_id: 'conn_abc',
    ...overrides,
  }
}

describe('transformVendor', () => {
  it('maps id', () => {
    expect(transformVendor(makeVendor()).id).toBe('vendor_uuid_001')
  })

  it('maps name', () => {
    expect(transformVendor(makeVendor()).name).toBe('Acme Corp')
  })

  it('always sets isCustomer=false and isSupplier=true', () => {
    const result = transformVendor(makeVendor())
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(true)
  })

  it('maps is_active=true to isActive=true', () => {
    expect(transformVendor(makeVendor({ is_active: true })).isActive).toBe(true)
  })

  it('maps is_active=false to isActive=false', () => {
    expect(transformVendor(makeVendor({ is_active: false })).isActive).toBe(false)
  })

  it('defaults isActive to true when is_active is absent', () => {
    expect(transformVendor(makeVendor({ is_active: undefined })).isActive).toBe(true)
  })

  it('passes raw object as metadata', () => {
    const raw = makeVendor()
    expect(transformVendor(raw).metadata).toBe(raw)
  })

  it('produces output that passes ContactSchema validation', () => {
    expect(() => ContactSchema.parse(transformVendor(makeVendor()))).not.toThrow()
  })

  it('produces schema-valid output when optional fields are absent', () => {
    const result = transformVendor({ id: 'vendor_001' })
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawTexadaLocation,
} from '../../../../../../../src/verticals/inventory/adapters/texada/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('transformLocation', () => {
  const base: RawTexadaLocation = {
    branchId: 'branch-001',
    branchName: 'Main Depot',
    branchCode: 'MDT',
    active: true,
    address1: '100 Industrial Blvd',
    city: 'Austin',
    state: 'TX',
    country: 'US',
    postalCode: '78701',
    phone: '+15125550100',
    email: 'depot@example.com',
    parentBranchId: 'branch-000',
  }

  it('maps branchId → id and externalId', () => {
    const result = transformLocation(base)
    expect(result.id).toBe('branch-001')
    expect(result.externalId).toBe('branch-001')
  })

  it('maps branchName → name', () => {
    const result = transformLocation(base)
    expect(result.name).toBe('Main Depot')
  })

  it('maps branchCode → code', () => {
    const result = transformLocation(base)
    expect(result.code).toBe('MDT')
  })

  it('sets type to "warehouse" and platform to "texada"', () => {
    const result = transformLocation(base)
    expect(result.type).toBe('warehouse')
    expect(result.platform).toBe('texada')
  })

  it('resolves isActive from boolean active field', () => {
    const result = transformLocation({ ...base, active: true })
    expect(result.isActive).toBe(true)
  })

  it('resolves isActive from string "Y"', () => {
    const result = transformLocation({ ...base, active: 'Y' })
    expect(result.isActive).toBe(true)
  })

  it('resolves isActive via status when active is absent', () => {
    const { active, ...rest } = base
    const result = transformLocation({ ...rest, status: 'inactive' })
    expect(result.isActive).toBe(false)
  })

  it('resolves isActive=true when status is not "inactive"', () => {
    const { active, ...rest } = base
    const result = transformLocation({ ...rest, status: 'active' })
    expect(result.isActive).toBe(true)
  })

  it('maps parentBranchId → parentLocationId', () => {
    const result = transformLocation(base)
    expect(result.parentLocationId).toBe('branch-000')
  })

  it('builds address from address fields', () => {
    const result = transformLocation(base)
    expect(result.address).toBeDefined()
    expect(result.address?.line1).toBe('100 Industrial Blvd')
    expect(result.address?.city).toBe('Austin')
    expect(result.address?.country).toBe('US')
    expect(result.address?.postalCode).toBe('78701')
  })

  it('omits address when no address fields are present', () => {
    const result = transformLocation({ branchId: 'b1', branchName: 'Depot', active: true })
    expect(result.address).toBeUndefined()
  })

  it('falls back branchNo → id when branchId is absent', () => {
    const { branchId, ...rest } = base
    const result = transformLocation({ ...rest, branchNo: 'BN-002' })
    expect(result.id).toBe('BN-002')
  })

  it('falls back name → name when branchName is absent', () => {
    const { branchName, ...rest } = base
    const result = transformLocation({ ...rest, name: 'Fallback Name' })
    expect(result.name).toBe('Fallback Name')
  })

  it('falls back state → province for region', () => {
    const { state, ...rest } = base
    const result = transformLocation({ ...rest, province: 'Ontario' })
    expect(result.address?.region).toBe('Ontario')
  })

  it('falls back postalCode → zip', () => {
    const { postalCode, ...rest } = base
    const result = transformLocation({ ...rest, zip: '78702' })
    expect(result.address?.postalCode).toBe('78702')
  })

  it('produces output that satisfies LocationSchema', () => {
    const result = transformLocation(base)
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})

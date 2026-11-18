/**
 * Get-Warehouses API rows (Shipmozo API documentation PDF, "Response Fields"):
 * id "Unique identifier for the warehouse", address_title "Title or name for
 * the warehouse address", name "Name of the contact person for the
 * warehouse", pincode "Postal code for the warehouse location", country
 * "Country where the warehouse is located" (example "India"), status
 * "Current status of the warehouse (e.g., "ACTIVE", "INACTIVE")".
 */
import { describe, it, expect } from 'vitest'
import { transformWarehouse } from '../../../../../../../src/verticals/logistics/adapters/shipmozo/transform/warehouse'
import { WarehouseSchema } from '../../../../../../../src/verticals/logistics/schema/warehouse'
import { docWarehouseRow, docWarehouseRowInactive } from '../fixtures'

describe('shipmozo transformWarehouse', () => {
  it('maps the documented example row and parses as a Warehouse', () => {
    const raw = docWarehouseRow()
    const w = WarehouseSchema.parse(transformWarehouse(raw))
    expect(w).toEqual({
      id: '23481',
      name: 'Sunshine Warehouse',
      isActive: true,
      address: {
        name: 'Rahul Sharma',
        street1: 'Sunshine Plaza, Sector 12',
        street2: 'Near Main Road',
        city: 'Gurgaon',
        state: 'Haryana',
        postalCode: '122018',
        phone: '9001234567',
        email: 'rahul.sharma@example.com',
      },
      metadata: raw,
    })
  })

  it('reads status INACTIVE as not active', () => {
    const w = WarehouseSchema.parse(transformWarehouse(docWarehouseRowInactive()))
    expect(w.isActive).toBe(false)
    expect(w.id).toBe('23482')
  })

  it('leaves isActive unset for a status the docs do not name', () => {
    expect(
      transformWarehouse({ ...docWarehouseRow(), status: 'ARCHIVED' }).isActive,
    ).toBeUndefined()
  })

  it('never puts the documented country name into the ISO alpha-2 field', () => {
    expect(transformWarehouse(docWarehouseRow()).address?.country).toBeUndefined()
  })

  it('omits empty optional strings', () => {
    const w = transformWarehouse({ ...docWarehouseRow(), address_line_two: '', email: '' })
    expect(w.address?.street2).toBeUndefined()
    expect(w.address?.email).toBeUndefined()
    expect(() => WarehouseSchema.parse(w)).not.toThrow()
  })

  it('throws on a row without the documented id', () => {
    const { id: _id, ...rest } = docWarehouseRow()
    expect(() => transformWarehouse(rest)).toThrow(/id/)
  })
})

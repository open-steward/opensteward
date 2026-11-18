import { describe, it, expect } from 'vitest'
import {
  transformWarehouse,
  type SpApiSupplySource,
} from '../../../../../../../src/verticals/logistics/adapters/amazon-sp-api/transform/warehouse'
import { WarehouseSchema } from '../../../../../../../src/verticals/logistics/schema/warehouse'

/**
 * A supply source is a seller's ship-from location — SP-API's warehouse.
 * The by-id response (`GET /supplySources/2020-07-01/supplySources/{id}`) is
 * the full record below; the list endpoint returns only alias, id, code and
 * address per row.
 */
function makeSupplySource(overrides: Partial<SpApiSupplySource> = {}): SpApiSupplySource {
  return {
    supplySourceId: 'e2f1c6a0-7b3d-4c9e-8f21-0a5b4d3c2e1f',
    supplySourceCode: 'SEA-01',
    alias: 'Seattle store',
    status: 'Active',
    address: {
      name: 'Acme Seattle',
      addressLine1: '400 Pine St',
      addressLine2: 'Floor 2',
      city: 'Seattle',
      stateOrRegion: 'WA',
      postalCode: '98101',
      countryCode: 'US',
      phone: '+12065550100',
    },
    configuration: {
      timezone: 'America/Los_Angeles',
      operationalConfiguration: {
        contactDetails: { primary: { email: 'ops@acme.example', phone: '+12065550101' } },
        throughputConfig: {
          throughputUnit: 'Day',
          throughputCap: { value: 100, timeUnit: 'Hours' },
        },
        handlingTime: { value: 1, timeUnit: 'Hours' },
      },
    },
    capabilities: { outbound: { isSupported: true } },
    createdAt: '2026-01-15T09:30:00Z',
    updatedAt: '2026-02-01T14:20:00Z',
    ...overrides,
  }
}

/** The list-row shape: no status, configuration or timestamps. */
function makeListRow(): SpApiSupplySource {
  const { supplySourceId, supplySourceCode, alias, address } = makeSupplySource()
  return { supplySourceId, supplySourceCode, alias, address }
}

describe('amazon-sp-api transformWarehouse', () => {
  it('maps id, name and code', () => {
    const w = transformWarehouse(makeSupplySource())
    expect(w.id).toBe('e2f1c6a0-7b3d-4c9e-8f21-0a5b4d3c2e1f')
    expect(w.name).toBe('Seattle store')
    expect(w.code).toBe('SEA-01')
  })

  it("maps Amazon's address keys onto the canonical ones", () => {
    // `addressLine1` and `stateOrRegion` are not aliases the shared
    // `toAddress` reads, so a raw pass-through would silently drop the
    // street and state. This pins that they are renamed first.
    const w = transformWarehouse(makeSupplySource())
    expect(w.address).toEqual({
      name: 'Acme Seattle',
      company: undefined,
      street1: '400 Pine St',
      street2: 'Floor 2',
      city: 'Seattle',
      state: 'WA',
      postalCode: '98101',
      country: 'US',
      phone: '+12065550100',
      email: 'ops@acme.example',
    })
  })

  it('folds a third address line onto street2', () => {
    const src = makeSupplySource()
    src.address = { ...src.address, addressLine3: 'Loading dock B' }
    expect(transformWarehouse(src).address?.street2).toBe('Floor 2, Loading dock B')
  })

  it('falls back to the primary contact phone when the address has none', () => {
    const src = makeSupplySource()
    src.address = { ...src.address, phone: null }
    expect(transformWarehouse(src).address?.phone).toBe('+12065550101')
  })

  it('leaves the address undefined when the source has none', () => {
    expect(
      transformWarehouse(makeSupplySource({ address: null, configuration: null })).address,
    ).toBeUndefined()
  })

  it.each([
    ['Active', true],
    ['Inactive', false],
    ['Archived', false],
    ['Something', undefined],
    [undefined, undefined],
  ])('maps status %s → isActive %s', (status, expected) => {
    expect(transformWarehouse(makeSupplySource({ status })).isActive).toBe(expected)
  })

  it('carries the configured timezone', () => {
    expect(transformWarehouse(makeSupplySource()).timezone).toBe('America/Los_Angeles')
  })

  it('parses createdAt and updatedAt to dates', () => {
    const w = transformWarehouse(makeSupplySource())
    expect(w.createdAt).toEqual(new Date('2026-01-15T09:30:00Z'))
    expect(w.updatedAt).toEqual(new Date('2026-02-01T14:20:00Z'))
  })

  it('preserves the raw payload by reference', () => {
    const raw = makeSupplySource()
    expect(transformWarehouse(raw).metadata).toBe(raw)
  })

  it('produces output the canonical schema accepts', () => {
    expect(() => WarehouseSchema.parse(transformWarehouse(makeSupplySource()))).not.toThrow()
  })

  it('handles a list row, which lacks status, configuration and timestamps', () => {
    const w = transformWarehouse(makeListRow())
    expect(w.isActive).toBeUndefined()
    expect(w.timezone).toBeUndefined()
    expect(w.createdAt).toBeUndefined()
    expect(w.address?.street1).toBe('400 Pine St')
    expect(WarehouseSchema.safeParse(w).success).toBe(true)
  })

  it('parses a sparse source too', () => {
    expect(WarehouseSchema.safeParse(transformWarehouse({})).success).toBe(true)
  })
})

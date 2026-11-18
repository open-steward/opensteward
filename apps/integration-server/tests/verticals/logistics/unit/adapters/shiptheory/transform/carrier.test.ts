import { describe, it, expect } from 'vitest'
import {
  transformCarrierFromServices,
  type ShiptheoryServicesMap,
} from '../../../../../../../src/verticals/logistics/adapters/shiptheory/transform/carrier'
import { CarrierSchema } from '../../../../../../../src/verticals/logistics/schema/carrier'
import type { ShiptheoryService } from '../../../../../../../src/verticals/logistics/adapters/shiptheory/transform/rate'

describe('Shiptheory transformCarrierFromServices', () => {
  const services: ShiptheoryService[] = [
    { id: 1, name: 'DPD_NEXT_DAY', carrier: 'dpd', carrier_name: 'DPD' },
    { id: 2, name: 'DPD_TWO_DAY', carrier: 'dpd', carrier_name: 'DPD' },
  ]

  it('uses the slug as id, name, and code', () => {
    const result = transformCarrierFromServices('dpd', services)
    expect(result.id).toBe('dpd')
    expect(result.name).toBe('dpd')
    expect(result.code).toBe('dpd')
  })

  it('maps services to CarrierService array with code from service name', () => {
    const result = transformCarrierFromServices('dpd', services)
    expect(result.services).toHaveLength(2)
    expect(result.services![0].code).toBe('DPD_NEXT_DAY')
    expect(result.services![1].code).toBe('DPD_TWO_DAY')
  })

  it('sets isActive to true', () => {
    const result = transformCarrierFromServices('dpd', services)
    expect(result.isActive).toBe(true)
  })

  it('passes CarrierSchema validation', () => {
    const result = transformCarrierFromServices('dpd', services)
    expect(() => CarrierSchema.parse(result)).not.toThrow()
  })

  it('produces undefined services when array is empty', () => {
    const result = transformCarrierFromServices('empty', [])
    expect(result.services).toBeUndefined()
  })

  it('handles service with null name using UNKNOWN fallback', () => {
    const result = transformCarrierFromServices('carrier', [{ id: 9, name: null }])
    expect(result.services![0].code).toBe('UNKNOWN')
  })
})

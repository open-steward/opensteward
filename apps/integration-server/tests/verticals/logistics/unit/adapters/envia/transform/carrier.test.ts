/**
 * Fixture follows the documented `data` object of GET /carrier/{carrier_id}:
 * id (integer), name, code, active, services[{ id, name, code }]
 * https://docs.envia.com/reference/carrier-by-id.md
 */
import { describe, it, expect } from 'vitest'
import {
  transformCarrier,
  type EnviaCarrier,
} from '../../../../../../../src/verticals/logistics/adapters/envia/transform/carrier'
import { CarrierSchema } from '../../../../../../../src/verticals/logistics/schema/carrier'

const carrier: EnviaCarrier = {
  id: 1,
  name: 'fedex',
  code: 'fedex',
  active: true,
  services: [
    { id: 10, name: 'Express', code: 'express' },
    { id: 11, name: 'No code' },
  ],
}

describe('transformCarrier', () => {
  it('parses with CarrierSchema', () => {
    const c = CarrierSchema.parse(transformCarrier(carrier))
    expect(c.id).toBe('1')
    expect(c.name).toBe('fedex')
    expect(c.code).toBe('fedex')
    expect(c.isActive).toBe(true)
    expect(c.services).toEqual([{ code: 'express', name: 'Express' }])
    expect(c.metadata).toEqual(carrier)
  })

  it('reports inactive carriers as inactive and never defaults active', () => {
    expect(transformCarrier({ ...carrier, active: false }).isActive).toBe(false)
    expect(transformCarrier({ id: 2 }).isActive).toBeUndefined()
  })

  it('drops services without the required code', () => {
    expect(transformCarrier({ id: 3, services: [{ id: 1, name: 'x' }] }).services).toBeUndefined()
  })
})

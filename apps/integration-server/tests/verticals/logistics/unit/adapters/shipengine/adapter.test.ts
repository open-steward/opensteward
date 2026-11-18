/**
 * List-method envelope handling. The transform tests cover a raw record →
 * canonical; this file covers the step before that — what the adapter does
 * with the response body ShipEngine actually sends. `GET /v1/warehouses`
 * returns `{ "warehouses": [...] }` (required key, per the ShipEngine
 * OpenAPI spec), not a bare array, and an adapter that guards with
 * `Array.isArray` returns `[]` forever with a green 200.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }))

vi.mock('../../../../../../src/verticals/logistics/adapters/shipengine/client', () => ({
  ShipEngineClient: class {
    get = getMock
  },
}))

import { ShipEngineAdapter } from '../../../../../../src/verticals/logistics/adapters/shipengine'
import type { ShipEngineWarehouse } from '../../../../../../src/verticals/logistics/adapters/shipengine/transform/warehouse'
import { WarehouseSchema } from '../../../../../../src/verticals/logistics/schema/warehouse'
import type { Credentials } from '../../../../../../src/verticals/logistics/adapter/interface'

const credentials = { accessToken: 'TEST_key' } as Credentials
const adapter = new ShipEngineAdapter()

function rawWarehouse(id: string): ShipEngineWarehouse {
  return {
    warehouse_id: id,
    name: `Warehouse ${id}`,
    origin_address: {
      name: 'Acme Logistics',
      address_line1: '1 Market St',
      city_locality: 'San Francisco',
      state_province: 'CA',
      postal_code: '94105',
      country_code: 'US',
    },
    return_address: {
      name: 'Acme Returns',
      address_line1: '2 Market St',
      city_locality: 'San Francisco',
      state_province: 'CA',
      postal_code: '94105',
      country_code: 'US',
    },
    created_at: '2024-03-01T00:00:00Z',
  }
}

describe('ShipEngineAdapter.listWarehouses', () => {
  beforeEach(() => {
    getMock.mockReset()
  })

  it('unwraps the { warehouses: [...] } envelope the API returns', async () => {
    getMock.mockResolvedValueOnce({
      warehouses: [rawWarehouse('se-wh-001'), rawWarehouse('se-wh-002')],
    })

    const out = await adapter.listWarehouses(credentials, {})

    expect(getMock).toHaveBeenCalledWith('/warehouses')
    expect(out.map((w) => w.id)).toEqual(['se-wh-001', 'se-wh-002'])
    for (const w of out) expect(() => WarehouseSchema.parse(w)).not.toThrow()
  })

  it('returns [] for an empty envelope', async () => {
    getMock.mockResolvedValueOnce({ warehouses: [] })
    expect(await adapter.listWarehouses(credentials, {})).toEqual([])
  })
})

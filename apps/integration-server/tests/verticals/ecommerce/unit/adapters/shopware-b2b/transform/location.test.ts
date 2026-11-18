import { describe, it, expect } from 'vitest'
import { ShopwareB2BAdapter } from '../../../../../../../src/verticals/ecommerce/adapters/shopware-b2b/index'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

describe('Shopware B2B locations', () => {
  const adapter = new ShopwareB2BAdapter()

  it('listLocations returns synthetic default', async () => {
    const creds = { accessToken: 'test', extra: {} }
    const locations = await adapter.listLocations!(creds, {})
    expect(locations).toHaveLength(1)
    expect(locations[0]!.id).toBe('default')
    expect(locations[0]!.name).toBe('Default Warehouse')
    expect(locations[0]!.isFulfillmentCenter).toBe(true)
    expect(() => LocationSchema.parse(locations[0])).not.toThrow()
  })

  it('getLocation returns default by id', async () => {
    const creds = { accessToken: 'test', extra: {} }
    const loc = await adapter.getLocation!(creds, 'default')
    expect(loc.id).toBe('default')
    expect(loc.metadata).toMatchObject({ synthetic: true })
  })

  it('getLocation throws for unknown id', async () => {
    const creds = { accessToken: 'test', extra: {} }
    await expect(adapter.getLocation!(creds, 'unknown')).rejects.toThrow(
      'Shopware B2B location not found',
    )
  })
})

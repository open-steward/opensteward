import { describe, it, expect } from 'vitest'
import {
  transformSkuGroup,
  type RawGoDaddySkuGroup,
} from '../../../../../../../src/verticals/ecommerce/adapters/godaddy-websites-commerce/transform/sku-group'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

/**
 * Built from the documented `skuGroups` 200 example
 * (https://developer.godaddy.com/docs/references/rest/catalog/sku-group/queries/skuGroups):
 * `{ "id": "ID_VALUE", "name": "example", "status": "DRAFT", "label": "Example" }`,
 * plus the non-null `type`, `createdAt`, `updatedAt` the SKUGroup reference lists.
 */
function makeSkuGroup(overrides: Partial<RawGoDaddySkuGroup> = {}): RawGoDaddySkuGroup {
  return {
    id: 'ID_VALUE',
    name: 'example',
    label: 'Example',
    description: 'A merchant description',
    status: 'DRAFT',
    type: 'PHYSICAL',
    createdAt: '2026-08-27T10:00:00.000Z',
    updatedAt: '2026-08-28T11:30:00.000Z',
    ...overrides,
  }
}

describe('transformSkuGroup (GoDaddy SKUGroup → Product)', () => {
  it('parses against the canonical ProductSchema', () => {
    expect(() => ProductSchema.parse(transformSkuGroup(makeSkuGroup()))).not.toThrow()
  })

  it('maps the documented fields', () => {
    const p = transformSkuGroup(makeSkuGroup())
    expect(p.id).toBe('ID_VALUE')
    expect(p.title).toBe('Example')
    expect(p.description).toBe('A merchant description')
    expect(p.handle).toBe('example')
    expect(p.status).toBe('DRAFT')
    expect(p.productType).toBe('PHYSICAL')
    expect(p.createdAt).toBe('2026-08-27T10:00:00.000Z')
    expect(p.updatedAt).toBe('2026-08-28T11:30:00.000Z')
    expect(p.metadata).toMatchObject({ id: 'ID_VALUE', name: 'example' })
  })

  it('titles a group without a label by its non-null name', () => {
    expect(transformSkuGroup(makeSkuGroup({ label: null })).title).toBe('example')
  })

  it('turns an underscore name into a valid slug handle', () => {
    const p = transformSkuGroup(makeSkuGroup({ name: 'blue_shirt' }))
    expect(p.handle).toBe('blue-shirt')
    expect(() => ProductSchema.parse(p)).not.toThrow()
  })

  it('leaves status unset for a value outside DRAFT/ACTIVE/ARCHIVED', () => {
    const p = transformSkuGroup(makeSkuGroup({ status: 'HIDDEN' }))
    expect(p.status).toBeUndefined()
    expect(() => ProductSchema.parse(p)).not.toThrow()
  })
})

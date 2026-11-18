import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawShelfNuAsset,
} from '../../../../../../../src/verticals/inventory/adapters/shelf-nu/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('shelf-nu transformProduct', () => {
  const raw: RawShelfNuAsset = {
    id: 'asset-xyz',
    title: 'Dell Laptop',
    description: 'A business laptop',
    status: 'AVAILABLE',
    availableToBook: true,
    valuation: 1299.99,
    sequentialId: 'SEQ-0042',
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-06-01T00:00:00Z',
    organizationId: 'org-1',
    category: { id: 'cat-1', name: 'Electronics', color: '#fff' },
    location: { id: 'loc-1', name: 'Server Room' },
    organization: { currency: 'USD' },
    kit: null,
    tags: [],
    qrCodes: [],
    customFields: [],
  }

  it('maps id to id and externalId', () => {
    const result = transformProduct(raw)
    expect(result.id).toBe('asset-xyz')
    expect(result.externalId).toBe('asset-xyz')
  })

  it('maps title to name', () => {
    const result = transformProduct(raw)
    expect(result.name).toBe('Dell Laptop')
  })

  it('maps sequentialId to sku', () => {
    const result = transformProduct(raw)
    expect(result.sku).toBe('SEQ-0042')
  })

  it('falls back to id for sku when sequentialId absent', () => {
    const noSeq: RawShelfNuAsset = { ...raw, sequentialId: null }
    const result = transformProduct(noSeq)
    expect(result.sku).toBe('asset-xyz')
  })

  it('converts valuation float to cents', () => {
    const result = transformProduct(raw)
    expect(result.retailPrice?.amount).toBe(Math.round(1299.99 * 100))
  })

  it('uses organization.currency for retailPrice.currency', () => {
    const result = transformProduct(raw)
    expect(result.retailPrice?.currency).toBe('USD')
  })

  it('defaults retailPrice.currency to USD when organization is absent', () => {
    const noCurrency: RawShelfNuAsset = { ...raw, organization: undefined }
    const result = transformProduct(noCurrency)
    expect(result.retailPrice?.currency).toBe('USD')
  })

  it('sets isActive true when status is AVAILABLE', () => {
    const result = transformProduct(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive false when status is ARCHIVED', () => {
    const archived: RawShelfNuAsset = { ...raw, status: 'ARCHIVED' }
    expect(transformProduct(archived).isActive).toBe(false)
  })

  it('maps category.name to category', () => {
    const result = transformProduct(raw)
    expect(result.category).toBe('Electronics')
  })

  it('maps kit.id to parentProductId', () => {
    const inKit: RawShelfNuAsset = {
      ...raw,
      kit: { id: 'kit-001', name: 'Kit A', status: 'AVAILABLE' },
    }
    const result = transformProduct(inKit)
    expect(result.parentProductId).toBe('kit-001')
  })

  it('maps createdAt to createdAt', () => {
    const result = transformProduct(raw)
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to shelf-nu', () => {
    const result = transformProduct(raw)
    expect(result.platform).toBe('shelf-nu')
  })

  it('satisfies ProductSchema', () => {
    expect(() => ProductSchema.parse(transformProduct(raw))).not.toThrow()
  })
})

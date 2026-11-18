import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawCheqroomItem,
} from '../../../../../../../src/verticals/inventory/adapters/cheqroom/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('cheqroom transformProduct', () => {
  it('maps _id to id and externalId', () => {
    const raw: RawCheqroomItem = {
      _id: 'item_abc',
      name: 'Canon DSLR',
    }
    const result = transformProduct(raw)

    expect(result.id).toBe('item_abc')
    expect(result.externalId).toBe('item_abc')
  })

  it('always sets sku to empty string', () => {
    const raw: RawCheqroomItem = { _id: 'item_1' }
    const result = transformProduct(raw)
    expect(result.sku).toBe('')
  })

  it('maps brand from raw brand field', () => {
    const raw: RawCheqroomItem = { _id: 'item_2', brand: 'Nikon' }
    const result = transformProduct(raw)
    expect(result.brand).toBe('Nikon')
  })

  it('resolves first code string to upc', () => {
    const raw: RawCheqroomItem = { _id: 'item_3', codes: ['QR12345', 'QR67890'] }
    const result = transformProduct(raw)
    expect(result.upc).toBe('QR12345')
  })

  it('resolves first code object to upc via .code property', () => {
    const raw: RawCheqroomItem = {
      _id: 'item_4',
      codes: [{ code: 'QR-OBJ-001', type: 'qr' }],
    }
    const result = transformProduct(raw)
    expect(result.upc).toBe('QR-OBJ-001')
  })

  it('resolves category string to category field', () => {
    const raw: RawCheqroomItem = { _id: 'item_5', category: 'cat_cameras' }
    const result = transformProduct(raw)
    expect(result.category).toBe('cat_cameras')
  })

  it('resolves category object _id to category field', () => {
    const raw: RawCheqroomItem = {
      _id: 'item_6',
      category: { _id: 'cat_lenses', name: 'Lenses' },
    }
    const result = transformProduct(raw)
    expect(result.category).toBe('cat_lenses')
  })

  it('sets isActive to true when archived is not set', () => {
    const raw: RawCheqroomItem = { _id: 'item_7' }
    const result = transformProduct(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive to false when archived is true', () => {
    const raw: RawCheqroomItem = { _id: 'item_8', archived: true }
    const result = transformProduct(raw)
    expect(result.isActive).toBe(false)
  })

  it('stores purchase metadata in metadata record', () => {
    const raw: RawCheqroomItem = {
      _id: 'item_9',
      status: 'available',
      model: 'EOS R5',
      purchasePrice: 3999.99,
      purchaseDate: '2024-03-01T00:00:00Z',
      warrantyDate: '2024-03-01T00:00:00Z',
    }
    const result = transformProduct(raw)

    expect(result.metadata['status']).toBe('available')
    expect(result.metadata['model']).toBe('EOS R5')
    expect(result.metadata['purchasePrice']).toBe('3999.99')
  })

  it('resolves location string reference into metadata locationId', () => {
    const raw: RawCheqroomItem = { _id: 'item_10', location: 'loc_main' }
    const result = transformProduct(raw)
    expect(result.metadata['locationId']).toBe('loc_main')
  })

  it('maps createdAt and updatedAt from created/modified', () => {
    const raw: RawCheqroomItem = {
      _id: 'item_11',
      created: '2024-03-01T00:00:00Z',
      modified: '2024-03-01T00:00:00Z',
    }
    const result = transformProduct(raw)
    // toIso normalises via new Date().toISOString() which may append milliseconds
    expect(result.createdAt).toContain('2024-03-01')
    expect(result.updatedAt).toContain('2024-03-01')
  })

  it('passes ProductSchema validation', () => {
    const raw: RawCheqroomItem = {
      _id: 'item_full',
      name: 'Sony A7III',
      brand: 'Sony',
      model: 'A7III',
      codes: ['QR-SONY-001'],
      category: { _id: 'cat_cameras', name: 'Cameras' },
      status: 'available',
      archived: false,
      location: { _id: 'loc_main', name: 'Main Depot' },
      purchasePrice: 2499,
      created: '2024-03-01T00:00:00Z',
      modified: '2024-03-01T00:00:00Z',
    }
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

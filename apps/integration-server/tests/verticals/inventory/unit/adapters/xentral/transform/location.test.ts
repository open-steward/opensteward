import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawXentralWarehouse,
} from '../../../../../../../src/verticals/inventory/adapters/xentral/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

const rawWarehouse: RawXentralWarehouse = {
  id: 'wh-1',
  designation: 'Main Warehouse Berlin',
  project: { id: 'proj-42' },
}

describe('xentral transformLocation', () => {
  it('maps id to id and externalId', () => {
    const result = transformLocation(rawWarehouse)
    expect(result.id).toBe('wh-1')
    expect(result.externalId).toBe('wh-1')
  })

  it('maps designation to name', () => {
    const result = transformLocation(rawWarehouse)
    expect(result.name).toBe('Main Warehouse Berlin')
  })

  it('sets type=warehouse', () => {
    const result = transformLocation(rawWarehouse)
    expect(result.type).toBe('warehouse')
  })

  it('sets isActive=true', () => {
    const result = transformLocation(rawWarehouse)
    expect(result.isActive).toBe(true)
  })

  it('stores project.id in metadata', () => {
    const result = transformLocation(rawWarehouse)
    expect(result.metadata['projectId']).toBe('proj-42')
  })

  it('sets platform=xentral', () => {
    const result = transformLocation(rawWarehouse)
    expect(result.platform).toBe('xentral')
  })

  it('produces a schema-valid Location', () => {
    const result = transformLocation(rawWarehouse)
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })

  it('defaults name to empty string when designation absent', () => {
    const result = transformLocation({ id: 'wh-2' })
    expect(result.name).toBe('')
  })
})

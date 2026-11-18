// NuORDER Warehouse `name` field verified verbatim against
// https://assets.nuorder.com/api-docs/index.html; `address`/`code` are only
// mentioned in prose there (no JSON shape shown) so they are not promoted —
// see transform/location.ts header.
import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawNuorderWarehouse,
} from '../../../../../../../src/verticals/ecommerce/adapters/nuorder/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

function makeRaw(overrides: Partial<RawNuorderWarehouse> = {}): RawNuorderWarehouse {
  return { id: 301, name: 'East Coast DC', code: 'EC-DC', active: true, ...overrides }
}

describe('transformLocation (NuORDER Warehouse)', () => {
  it('passes the canonical schema', () => {
    expect(() => LocationSchema.parse(transformLocation(makeRaw()))).not.toThrow()
  })

  it('maps id to string canonical id', () => {
    expect(transformLocation(makeRaw()).id).toBe('301')
  })

  it('falls back to code when id is absent', () => {
    expect(transformLocation(makeRaw({ id: undefined })).id).toBe('EC-DC')
  })

  it('throws rather than inventing an id when neither id nor code is present', () => {
    expect(() => transformLocation(makeRaw({ id: undefined, code: undefined }))).toThrow(/id/i)
  })

  it('maps name and active through', () => {
    const result = transformLocation(makeRaw())
    expect(result.name).toBe('East Coast DC')
    expect(result.active).toBe(true)
  })

  it('leaves address unset — no documented JSON shape for it', () => {
    expect(transformLocation(makeRaw()).address).toBeUndefined()
  })

  it('preserves the raw record as metadata (address, if any, still reaches the caller there)', () => {
    const raw = makeRaw()
    expect(transformLocation(raw).metadata).toEqual(raw)
  })
})

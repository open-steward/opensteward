import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type DelivereeLocation,
} from '../../../../../../../src/verticals/logistics/adapters/deliveree/transform/location'
import { AddressSchema } from '../../../../../../../src/verticals/logistics/schema/shared'

function makeLocation(overrides: Partial<DelivereeLocation> = {}): DelivereeLocation {
  return {
    address: '123 Main Street, Bangkok',
    recipient_name: 'Jane Doe',
    recipient_phone: '+66812345678',
    note: 'Leave at door',
    ...overrides,
  }
}

describe('deliveree transformLocation', () => {
  it('maps street address', () => {
    const result = transformLocation(makeLocation())
    expect(result?.street1).toBe('123 Main Street, Bangkok')
  })

  it('maps recipient name', () => {
    const result = transformLocation(makeLocation())
    expect(result?.name).toBe('Jane Doe')
  })

  it('maps recipient phone', () => {
    const result = transformLocation(makeLocation())
    expect(result?.phone).toBe('+66812345678')
  })

  it('returns undefined for null input', () => {
    expect(transformLocation(null)).toBeUndefined()
    expect(transformLocation(undefined)).toBeUndefined()
  })

  it('returns undefined when all meaningful fields are absent', () => {
    expect(transformLocation({ note: 'something', need_cod: true })).toBeUndefined()
  })

  it('passes schema validation', () => {
    const result = transformLocation(makeLocation())
    expect(() => AddressSchema.parse(result)).not.toThrow()
  })
})

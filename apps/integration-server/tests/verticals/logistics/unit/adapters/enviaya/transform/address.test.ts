import { describe, it, expect } from 'vitest'
import {
  transformDirection,
  type EnviaYaDirection,
} from '../../../../../../../src/verticals/logistics/adapters/enviaya/transform/address'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeDirection(overrides: Partial<EnviaYaDirection> = {}): EnviaYaDirection {
  return {
    full_name: 'Carlos Ramirez',
    company: 'Enviaya Test SA',
    direction_1: 'Av. Hidalgo 123',
    direction_2: 'Colonia Centro',
    city: 'Guadalajara',
    state_code: 'JAL',
    postal_code: '44100',
    country_code: 'MX',
    phone: '+523312345678',
    email: 'carlos@test.example',
    ...overrides,
  }
}

// ─── transformDirection ───────────────────────────────────────────────────────

describe('transformDirection', () => {
  it('maps full_name to name', () => {
    // raw.full_name → name — verified in source
    expect(transformDirection(makeDirection())?.name).toBe('Carlos Ramirez')
  })

  it('maps direction_1 to street1 and direction_2 to street2', () => {
    const result = transformDirection(makeDirection())
    // raw.direction_1 → street1, raw.direction_2 → street2 — verified in source
    expect(result?.street1).toBe('Av. Hidalgo 123')
    expect(result?.street2).toBe('Colonia Centro')
  })

  it('maps state_code to state and postal_code to postalCode', () => {
    const result = transformDirection(makeDirection())
    expect(result?.state).toBe('JAL')
    expect(result?.postalCode).toBe('44100')
  })

  it('maps country_code to country', () => {
    expect(transformDirection(makeDirection())?.country).toBe('MX')
  })

  it('maps phone and email', () => {
    const result = transformDirection(makeDirection())
    expect(result?.phone).toBe('+523312345678')
    expect(result?.email).toBe('carlos@test.example')
  })

  it('returns undefined when raw is null', () => {
    expect(transformDirection(null)).toBeUndefined()
  })

  it('returns undefined when raw is undefined', () => {
    expect(transformDirection(undefined)).toBeUndefined()
  })

  it('returns undefined when all fields are absent', () => {
    // hasAny check — verified in source
    const result = transformDirection({})
    expect(result).toBeUndefined()
  })

  it('returns an address when at least one field is present', () => {
    const result = transformDirection({ city: 'Tijuana' })
    expect(result?.city).toBe('Tijuana')
  })
})

import { describe, it, expect } from 'vitest'
import {
  transformMacro,
  type RawMissiveResponse,
} from '../../../../../../../src/verticals/customer-support/adapters/missive/transform/macro'
import { MacroSchema } from '../../../../../../../src/verticals/customer-support/schema/macro'

describe('missive transformMacro', () => {
  const raw: RawMissiveResponse = {
    id: 'resp-001',
    name: 'Password Reset',
    body: 'Please visit the link below to reset your password.',
    subject: 'Reset your password',
  }

  it('maps id and externalId from raw.id', () => {
    const result = transformMacro(raw)
    expect(result.id).toBe('resp-001')
    expect(result.externalId).toBe('resp-001')
  })

  it('maps name to title', () => {
    const result = transformMacro(raw)
    expect(result.title).toBe('Password Reset')
  })

  it('maps body field', () => {
    const result = transformMacro(raw)
    expect(result.body).toBe('Please visit the link below to reset your password.')
  })

  it('category is undefined (Missive has no category concept)', () => {
    const result = transformMacro(raw)
    expect(result.category).toBeUndefined()
  })

  it('sets platform to missive', () => {
    const result = transformMacro(raw)
    expect(result.platform).toBe('missive')
  })

  it('places subject in metadata', () => {
    const result = transformMacro(raw)
    expect(result.metadata['subject']).toBe('Reset your password')
  })

  it('produces a MacroSchema-valid result', () => {
    const result = transformMacro(raw)
    expect(() => MacroSchema.parse(result)).not.toThrow()
  })

  it('handles null name and body — falls back to empty strings', () => {
    const minimal: RawMissiveResponse = { id: 'r2', name: null, body: null }
    const result = transformMacro(minimal)
    expect(result.title).toBe('')
    expect(result.body).toBe('')
    expect(() => MacroSchema.parse(result)).not.toThrow()
  })
})

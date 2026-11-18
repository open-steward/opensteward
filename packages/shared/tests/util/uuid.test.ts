import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { isValidUuid, UUID_RE } from '../../src/util/uuid'

describe('isValidUuid', () => {
  it('accepts UUIDs minted by crypto.randomUUID', () => {
    for (let i = 0; i < 5; i++) {
      expect(isValidUuid(randomUUID())).toBe(true)
    }
  })

  it('accepts the all-zero v4 placeholder', () => {
    expect(isValidUuid('00000000-0000-4000-8000-000000000000')).toBe(true)
  })

  it('rejects free-form labels', () => {
    expect(isValidUuid('fake-uuid')).toBe(false)
    expect(isValidUuid('missing')).toBe(false)
    expect(isValidUuid('')).toBe(false)
  })

  it('rejects partial / over-length / bad-shape strings', () => {
    expect(isValidUuid('00000000-0000-4000-8000-00000000000')).toBe(false)
    expect(isValidUuid('00000000-0000-4000-8000-0000000000000')).toBe(false)
    expect(isValidUuid('zzzzzzzz-zzzz-4zzz-8zzz-zzzzzzzzzzzz')).toBe(false)
  })

  it('rejects non-string inputs', () => {
    expect(isValidUuid(undefined)).toBe(false)
    expect(isValidUuid(null)).toBe(false)
    expect(isValidUuid(42)).toBe(false)
  })

  it('rejects SQL/path-injection attempts', () => {
    expect(isValidUuid("' OR 1=1--")).toBe(false)
    expect(isValidUuid('../etc/passwd')).toBe(false)
  })

  it('UUID_RE is exported and matches the validator', () => {
    expect(UUID_RE.test('00000000-0000-4000-8000-000000000000')).toBe(true)
  })
})

import { describe, it, expect } from 'vitest'
import {
  transformTag,
  type RawLibredeskTag,
} from '../../../../../../../src/verticals/customer-support/adapters/libredesk/transform/tag'
import { TagSchema } from '../../../../../../../src/verticals/customer-support/schema/tag'

describe('libredesk transformTag', () => {
  it('maps id and externalId from raw.id', () => {
    const raw: RawLibredeskTag = { id: 7, name: 'billing' }
    const result = transformTag(raw)
    expect(result.id).toBe('7')
    expect(result.externalId).toBe('7')
  })

  it('maps name to name', () => {
    const raw: RawLibredeskTag = { id: 1, name: 'urgent' }
    const result = transformTag(raw)
    expect(result.name).toBe('urgent')
  })

  it('sets platform to libredesk', () => {
    const raw: RawLibredeskTag = { id: 2, name: 'feature-request' }
    const result = transformTag(raw)
    expect(result.platform).toBe('libredesk')
  })

  it('stores createdAt in metadata when present', () => {
    const raw: RawLibredeskTag = { id: 3, name: 'bug', created_at: '2026-01-15T09:30:00.000Z' }
    const result = transformTag(raw)
    expect(result.metadata['createdAt']).toBe('2026-01-15T09:30:00.000Z')
  })

  it('passes TagSchema validation', () => {
    const raw: RawLibredeskTag = {
      id: 99,
      name: 'login-issue',
      created_at: '2026-01-15T09:30:00.000Z',
    }
    const result = transformTag(raw)
    expect(() => TagSchema.parse(result)).not.toThrow()
  })
})

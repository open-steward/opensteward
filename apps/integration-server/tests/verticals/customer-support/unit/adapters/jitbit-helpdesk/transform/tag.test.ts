import { describe, it, expect } from 'vitest'
import {
  transformTag,
  type RawJitbitTag,
} from '../../../../../../../src/verticals/customer-support/adapters/jitbit-helpdesk/transform/tag'
import { TagSchema } from '../../../../../../../src/verticals/customer-support/schema/tag'

describe('jitbit-helpdesk transformTag', () => {
  it('uses name as both id and externalId', () => {
    const raw: RawJitbitTag = { name: 'billing' }
    const result = transformTag(raw)
    expect(result.id).toBe('billing')
    expect(result.externalId).toBe('billing')
  })

  it('maps name to name field', () => {
    const raw: RawJitbitTag = { name: 'urgent-issue' }
    const result = transformTag(raw)
    expect(result.name).toBe('urgent-issue')
  })

  it('sets platform to jitbit-helpdesk', () => {
    const raw: RawJitbitTag = { name: 'feature-request' }
    const result = transformTag(raw)
    expect(result.platform).toBe('jitbit-helpdesk')
  })

  it('passes TagSchema validation', () => {
    const raw: RawJitbitTag = { name: 'login-issue' }
    const result = transformTag(raw)
    expect(() => TagSchema.parse(result)).not.toThrow()
  })
})

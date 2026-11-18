import { describe, it, expect } from 'vitest'
import { transformUser } from '../../../../../../../src/verticals/projects/adapters/process-street/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'
import { JANE } from '../fixtures'

describe('process-street transformUser (documented PublicApiUser example)', () => {
  it('parses against UserSchema', () => {
    expect(() => UserSchema.parse(transformUser(JANE))).not.toThrow()
  })

  it('maps id, email, and username as the display name', () => {
    const u = UserSchema.parse(transformUser(JANE))
    expect(u.id).toBe('vGIRpoq0RIwBoNMM3-V-tw')
    expect(u.externalId).toBe('vGIRpoq0RIwBoNMM3-V-tw')
    expect(u.email).toBe('jane.doe@example.com')
    expect(u.name).toBe('Jane Doe')
    expect(u.workspaceIds).toEqual([])
    expect(u.platform).toBe('process-street')
  })
})

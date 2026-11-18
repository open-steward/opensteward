import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type PaperlessngxOrganization } from '../../../../../../../src/verticals/accounting/adapters/paperlessngx/transform/organization'

function makeCorrespondent(
  overrides: Partial<PaperlessngxOrganization> = {},
): PaperlessngxOrganization {
  return {
    id: 1,
    name: 'My Company',
    match: '',
    matching_algorithm: 1,
    is_insensitive: true,
    document_count: 100,
    ...overrides,
  }
}

describe('transformOrganization (Paperless-ngx)', () => {
  it('maps name from correspondent', () => {
    const result = transformOrganization(makeCorrespondent())
    expect(result.name).toBe('My Company')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeCorrespondent()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeCorrespondent())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})

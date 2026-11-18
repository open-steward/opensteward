import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type PaperlessCorrespondent } from '../../../../../../../src/verticals/accounting/adapters/paperlessngx/transform/contact'

function makeCorrespondent(overrides: Partial<PaperlessCorrespondent> = {}): PaperlessCorrespondent {
  return {
    id: 7,
    name: 'Mustermann GmbH',
    match: '',
    matching_algorithm: 1,
    is_insensitive: true,
    document_count: 5,
    ...overrides,
  }
}

describe('transformContact (Paperless-ngx)', () => {
  it('maps id and name correctly', () => {
    const result = transformContact(makeCorrespondent())
    expect(result.id).toBe('7')
    expect(result.name).toBe('Mustermann GmbH')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeCorrespondent()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeCorrespondent())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

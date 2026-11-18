import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type PaperlessDocument } from '../../../../../../../src/verticals/accounting/adapters/paperlessngx/transform/account'

function makeDocument(overrides: Partial<PaperlessDocument> = {}): PaperlessDocument {
  return {
    id: 42,
    title: 'Chart of Accounts',
    created: '2024-01-01T00:00:00Z',
    correspondent: null,
    document_type: 2,
    tags: [],
    archived_file_name: 'accounts.pdf',
    ...overrides,
  }
}

describe('transformAccount (Paperless-ngx)', () => {
  it('maps id and title as name', () => {
    const result = transformAccount(makeDocument())
    expect(result.id).toBe('42')
    expect(result.name).toBe('Chart of Accounts')
    expect(result.status).toBe('ACTIVE')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeDocument()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeDocument())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})

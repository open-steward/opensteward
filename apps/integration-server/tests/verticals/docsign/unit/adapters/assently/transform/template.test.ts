import { describe, it, expect } from 'vitest'
import { transformTemplate } from '../../../../../../../src/verticals/docsign/adapters/assently/transform/template'
import type { RawAssentlyCase } from '../../../../../../../src/verticals/docsign/adapters/assently/transform/envelope'
import { TemplateSchema } from '../../../../../../../src/verticals/docsign/schema/template'

describe('assently transformTemplate', () => {
  it('maps a raw case (template) to canonical Template', () => {
    const raw: RawAssentlyCase = {
      templateId: 'tmpl-001',
      caseId: 'case-001',
      name: 'Vendor NDA Template',
      nameAlias: 'NDA',
      culture: 'sv-SE',
      createdOn: '2026-01-01T00:00:00.000Z',
      parties: [
        { id: 'p1', signsAs: 0, groupName: 'Counterparty' },
        { id: 'p2', signsAs: 1, groupName: 'Company Rep' },
      ],
      documents: [{ id: 'doc-a' }, { id: 'doc-b' }],
    }

    const result = transformTemplate(raw)

    // id prefers templateId
    expect(result.id).toBe('tmpl-001')
    expect(result.externalId).toBe('tmpl-001')
    // name from raw.name
    expect(result.name).toBe('Vendor NDA Template')
    // signerRoles extracted from party groupName
    expect(result.signerRoles).toEqual(['Counterparty', 'Company Rep'])
    // documentCount from documents array length
    expect(result.documentCount).toBe(2)
    expect(result.platform).toBe('assently')
    // culture in metadata
    expect(result.metadata.culture).toBe('sv-SE')

    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })

  it('falls back to caseId then id for template id', () => {
    const r1 = transformTemplate({ caseId: 'case-x' })
    expect(r1.id).toBe('case-x')

    const r2 = transformTemplate({ id: 'only-id' })
    expect(r2.id).toBe('only-id')
  })

  it('falls back to nameAlias when name is absent', () => {
    const result = transformTemplate({ templateId: 't1', nameAlias: 'The Alias' })
    expect(result.name).toBe('The Alias')
  })

  it('filters out parties without groupName for signerRoles', () => {
    const raw: RawAssentlyCase = {
      templateId: 'tmpl-002',
      parties: [
        { id: 'p1', groupName: 'Role A' },
        { id: 'p2' }, // no groupName
        { id: 'p3', groupName: 'Role B' },
      ],
    }
    const result = transformTemplate(raw)
    expect(result.signerRoles).toEqual(['Role A', 'Role B'])
  })

  it('returns 0 documentCount when documents array absent', () => {
    const result = transformTemplate({ templateId: 'tmpl-003' })
    expect(result.documentCount).toBe(0)
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })
})

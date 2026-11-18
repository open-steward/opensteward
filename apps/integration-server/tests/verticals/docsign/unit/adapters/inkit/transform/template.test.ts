import { describe, it, expect } from 'vitest'
import {
  transformTemplate,
  type RawInkitTemplate,
} from '../../../../../../../src/verticals/docsign/adapters/inkit/transform/template'
import { TemplateSchema } from '../../../../../../../src/verticals/docsign/schema/template'

const base: RawInkitTemplate = {
  id: 'tmpl-ink-001',
  name: 'Invoice Template',
  description: 'Standard invoice layout',
  source: 'html',
  version: 3,
  merge_variables: { customer_name: '', invoice_number: '', total: '' },
  height: 297,
  width: 210,
  unit: 'mm',
  created_by: { id: 'u1', name: 'Ada Lovelace' },
  created_at: '2025-01-15T00:00:00.000Z',
  updated_at: '2025-06-01T00:00:00.000Z',
}

describe('inkit transformTemplate', () => {
  it('maps id and externalId from raw.id', () => {
    const result = transformTemplate(base)
    expect(result.id).toBe('tmpl-ink-001')
    expect(result.externalId).toBe('tmpl-ink-001')
  })

  it('maps name from raw.name', () => {
    const result = transformTemplate(base)
    expect(result.name).toBe('Invoice Template')
  })

  it('maps description', () => {
    const result = transformTemplate(base)
    expect(result.description).toBe('Standard invoice layout')
  })

  it('always sets signerRoles to empty array (generation platform, not e-signature)', () => {
    const result = transformTemplate(base)
    expect(result.signerRoles).toEqual([])
  })

  it('always sets documentCount to 1', () => {
    const result = transformTemplate(base)
    expect(result.documentCount).toBe(1)
  })

  it('maps createdAt and updatedAt to ISO strings', () => {
    const result = transformTemplate(base)
    expect(result.createdAt).toBe('2025-01-15T00:00:00.000Z')
    expect(result.updatedAt).toBe('2025-06-01T00:00:00.000Z')
  })

  it('sets platform to inkit', () => {
    const result = transformTemplate(base)
    expect(result.platform).toBe('inkit')
  })

  it('stores source and version in metadata', () => {
    const result = transformTemplate(base)
    expect(result.metadata['source']).toBe('html')
    expect(result.metadata['version']).toBe('3')
  })

  it('joins merge variable keys into metadata.mergeVariables', () => {
    const result = transformTemplate(base)
    expect(result.metadata['mergeVariables']).toBe('customer_name,invoice_number,total')
  })

  it('stores createdBy name in metadata', () => {
    const result = transformTemplate(base)
    expect(result.metadata['createdBy']).toBe('Ada Lovelace')
  })

  it('omits mergeVariables from metadata when merge_variables absent', () => {
    const result = transformTemplate({ ...base, merge_variables: undefined })
    expect(result.metadata['mergeVariables']).toBeUndefined()
  })

  it('passes TemplateSchema validation', () => {
    const result = transformTemplate(base)
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })

  it('passes TemplateSchema validation with minimal input', () => {
    const result = transformTemplate({ id: 'tmpl-min' })
    expect(result.id).toBe('tmpl-min')
    expect(result.name).toBe('')
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })
})

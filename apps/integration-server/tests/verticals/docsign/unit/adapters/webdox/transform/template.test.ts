import { describe, it, expect } from 'vitest'
import {
  transformTemplate,
  type RawWebdoxTemplate,
} from '../../../../../../../src/verticals/docsign/adapters/webdox/transform/template'
import { TemplateSchema } from '../../../../../../../src/verticals/docsign/schema/template'

describe('webdox transformTemplate', () => {
  it('maps a workflow template to canonical Template', () => {
    const raw: RawWebdoxTemplate = {
      id: 5,
      name: 'Standard NDA',
      text_description: 'Non-disclosure agreement template.',
      draft: false,
      created_at: '2026-01-01T10:00:00.000Z',
      updated_at: '2026-01-05T10:00:00.000Z',
      steps: [
        {
          name: 'Legal Review',
          number: 1,
          kind: 'review',
          signers: [],
        },
        {
          name: 'Signature Step',
          number: 2,
          kind: 'signature',
          signers: [
            { name: 'Party A', role: 'Counterparty' },
            { name: 'Party B', role: 'Client' },
          ],
        },
      ],
    }

    const result = transformTemplate(raw)

    expect(result.id).toBe('5')
    expect(result.externalId).toBe('5')
    expect(result.name).toBe('Standard NDA')
    expect(result.description).toBe('Non-disclosure agreement template.')
    // only signature steps contribute roles
    expect(result.signerRoles).toEqual(['Counterparty', 'Client'])
    expect(result.documentCount).toBe(0)
    expect(result.createdAt).toBeDefined()
    expect(result.updatedAt).toBeDefined()
    expect(result.platform).toBe('webdox')
    // stepCount stored in metadata
    expect(result.metadata.stepCount).toBe('2')

    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })

  it('falls back to text_description then description', () => {
    const raw: RawWebdoxTemplate = {
      id: 6,
      description: 'Fallback desc',
      text_description: undefined,
    }
    const result = transformTemplate(raw)
    expect(result.description).toBe('Fallback desc')
  })

  it('uses step name as role when signature step has no signers with roles', () => {
    const raw: RawWebdoxTemplate = {
      id: 7,
      steps: [{ name: 'Sign Here', kind: 'signature', signers: [] }],
    }
    const result = transformTemplate(raw)
    expect(result.signerRoles).toEqual(['Sign Here'])
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })

  it('produces valid template with minimal fields', () => {
    const result = transformTemplate({ id: 999 })
    expect(result.name).toBe('')
    expect(result.signerRoles).toEqual([])
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })
})

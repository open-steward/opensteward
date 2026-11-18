import { describe, it, expect } from 'vitest'
import { transformTemplate } from '../../../../../../../src/verticals/docsign/adapters/lex-persona/transform/template'
import { TemplateSchema } from '../../../../../../../src/verticals/docsign/schema/template'
import { template } from '../fixtures'

describe('lex-persona transformTemplate (Goodflag WorkflowTemplate)', () => {
  it('maps a documented WorkflowTemplate to a schema-valid Template', () => {
    const t = TemplateSchema.parse(transformTemplate(template(), 3))
    expect(t.id).toBe('wtm_1')
    expect(t.externalId).toBe('wtm_1')
    expect(t.name).toBe('Modèle NDA')
    expect(t.description).toBe('Accord de confidentialité')
    expect(t.signerRoles).toEqual([])
    expect(t.documentCount).toBe(3)
    expect(t.createdAt).toBe(new Date(1783777360803).toISOString())
    expect(t.updatedAt).toBe(new Date(1783777460803).toISOString())
    expect(t.metadata).toMatchObject({ isDisabled: 'false', stepCount: '1', tenantId: 'ten_1' })
    expect(t.platform).toBe('lex-persona')
  })
})

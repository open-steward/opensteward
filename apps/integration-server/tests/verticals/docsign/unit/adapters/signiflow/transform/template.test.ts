import { describe, it, expect } from 'vitest'
import {
  transformTemplateInfo,
  transformTemplate,
  type RawSigniFlowTemplateInfo,
  type RawSigniFlowTemplateFull,
} from '../../../../../../../src/verticals/docsign/adapters/signiflow/transform/template'
import { TemplateSchema } from '../../../../../../../src/verticals/docsign/schema/template'

describe('signiflow transformTemplateInfo', () => {
  it('maps a lightweight template-list entry to canonical Template', () => {
    const raw: RawSigniFlowTemplateInfo = {
      PrepperTemplateIDField: 101,
      NameField: 'NDA Template',
      TemplateDescriptionField: 'Standard non-disclosure agreement',
    }
    const result = transformTemplateInfo(raw)

    expect(result.id).toBe('101')
    expect(result.externalId).toBe('101')
    expect(result.name).toBe('NDA Template')
    expect(result.description).toBe('Standard non-disclosure agreement')
    expect(result.signerRoles).toEqual([])
    expect(result.documentCount).toBe(0)
    expect(result.platform).toBe('signiflow')
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })

  it('falls back to empty id and name when fields are absent', () => {
    const raw: RawSigniFlowTemplateInfo = {}
    const result = transformTemplateInfo(raw)

    expect(result.id).toBe('')
    expect(result.name).toBe('')
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })
})

describe('signiflow transformTemplate', () => {
  it('maps a full PrepperTemplateField to canonical Template with signer roles', () => {
    const raw: RawSigniFlowTemplateFull = {
      PrepperTemplateIDField: 202,
      TemplateNameField: 'Service Agreement',
      TemplateDescriptionField: 'Standard service agreement template',
      WorkflowField: [
        {
          RoleField: 'Client',
          UserEmailField: 'client@example.com',
          UserFullNameField: 'Client User',
        },
        {
          RoleField: 'Vendor',
          UserEmailField: 'vendor@example.com',
          UserFullNameField: 'Vendor Rep',
        },
      ],
      CreatedDateField: '2025-01-15T00:00:00.000Z',
      ModifiedDateField: '2025-06-01T00:00:00.000Z',
    }
    const result = transformTemplate(raw)

    expect(result.id).toBe('202')
    expect(result.name).toBe('Service Agreement')
    expect(result.description).toBe('Standard service agreement template')
    expect(result.signerRoles).toEqual(['Client', 'Vendor'])
    expect(result.createdAt).toBe('2025-01-15T00:00:00.000Z')
    expect(result.updatedAt).toBe('2025-06-01T00:00:00.000Z')
    expect(result.platform).toBe('signiflow')
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })

  it('falls back to UserFullNameField when RoleField is absent', () => {
    const raw: RawSigniFlowTemplateFull = {
      PrepperTemplateIDField: 303,
      TemplateNameField: 'Quick Sign',
      WorkflowField: [{ UserFullNameField: 'Alice Approver' }, { UserFullNameField: 'Bob Signer' }],
    }
    const result = transformTemplate(raw)

    expect(result.signerRoles).toEqual(['Alice Approver', 'Bob Signer'])
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })
})

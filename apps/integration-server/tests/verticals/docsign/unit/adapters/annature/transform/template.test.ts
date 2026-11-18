import { describe, it, expect } from 'vitest'
import {
  transformTemplate,
  type RawAnnatureTemplate,
} from '../../../../../../../src/verticals/docsign/adapters/annature/transform/template'
import { TemplateSchema } from '../../../../../../../src/verticals/docsign/schema/template'
import { TEMPLATE_EXAMPLE } from './fixtures'

const template = TEMPLATE_EXAMPLE as RawAnnatureTemplate

describe('annature transformTemplate', () => {
  it('maps the documented List all templates example onto the canonical schema', () => {
    const out = TemplateSchema.parse(transformTemplate(template))
    expect(out.id).toBe('7e8f68e4c6df9395cd7ff48d69d7e2c1')
    expect(out.externalId).toBe('7e8f68e4c6df9395cd7ff48d69d7e2c1')
    expect(out.name).toBe('Non disclosure agreement template')
    expect(out.description).toBeUndefined()
    expect(out.signerRoles).toEqual(['Client'])
    expect(out.documentCount).toBe(1)
    expect(out.createdAt).toBe('2019-12-17T05:30:00.000Z')
    expect(out.updatedAt).toBeUndefined()
    expect(out.metadata).toEqual({
      envelopeName: 'Non disclosure agreement',
      accountId: 'c64ce66b70b21c03bfd5dfa0ab14b730',
      groupId: 'a5a885caee6286a54ad7bbd4ab5400e9',
    })
    expect(out.platform).toBe('annature')
  })

  it('drops role passwords and document download links from raw', () => {
    const raw = transformTemplate(template).raw as {
      documents: Array<Record<string, unknown>>
      roles: Array<Record<string, unknown>>
    }
    expect(raw.roles[0]).not.toHaveProperty('recipient_password')
    expect(raw.roles[0]!['name']).toBe('Client')
    expect(raw.documents[0]).not.toHaveProperty('original')
    expect(raw.documents[0]).not.toHaveProperty('master')
  })

  it('refuses a template without its documents or roles arrays', () => {
    const { documents: _d, ...noDocs } = template
    const { roles: _r, ...noRoles } = template
    expect(() => transformTemplate(noDocs as RawAnnatureTemplate)).toThrow(/documents or roles/)
    expect(() => transformTemplate(noRoles as RawAnnatureTemplate)).toThrow(/documents or roles/)
  })
})

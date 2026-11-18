import { describe, it, expect } from 'vitest'
import {
  transformTemplate,
  type RawSignaturitTemplate,
} from '../../../../../../../src/verticals/docsign/adapters/signaturit/transform/template'
import { TemplateSchema } from '../../../../../../../src/verticals/docsign/schema/template'
import { TEMPLATE_EXAMPLE } from './fixtures'

describe('signaturit transformTemplate', () => {
  it('maps the documented GET /v3/templates.json example onto the canonical schema', () => {
    const out = TemplateSchema.parse(transformTemplate(TEMPLATE_EXAMPLE))
    expect(out.id).toBe('e5d25677-8a52-11e3-af02-080027880ca6')
    expect(out.externalId).toBe('e5d25677-8a52-11e3-af02-080027880ca6')
    expect(out.name).toBe('#nda')
    expect(out.createdAt).toBe('2014-08-20T14:19:51.000Z')
    // "A template is a prepared document that can be sent repeatedly."
    expect(out.documentCount).toBe(1)
    expect(out.signerRoles).toEqual([])
    expect(out.description).toBeUndefined()
    expect(out.updatedAt).toBeUndefined()
    expect(out.platform).toBe('signaturit')
  })

  it('refuses a template without its id or name', () => {
    const { id: _i, ...noId } = TEMPLATE_EXAMPLE
    const { name: _n, ...noName } = TEMPLATE_EXAMPLE
    expect(() => transformTemplate(noId as unknown as RawSignaturitTemplate)).toThrow(/id/)
    expect(() => transformTemplate(noName as unknown as RawSignaturitTemplate)).toThrow(/name/)
  })
})

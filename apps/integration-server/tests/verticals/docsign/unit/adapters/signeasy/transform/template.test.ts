/**
 * SignEasy template transform over the documented examples of GET /template
 * and GET /template/{template_id} (see ../signeasy.fixture.ts).
 */
import { describe, it, expect } from 'vitest'
import { transformTemplate } from '../../../../../../../src/verticals/docsign/adapters/signeasy/transform/template'
import { TemplateSchema } from '../../../../../../../src/verticals/docsign/schema/template'
import { FETCH_TEMPLATE_EXAMPLE, LIST_TEMPLATES_EXAMPLE } from '../signeasy.fixture'

const iso = (seconds: number) => new Date(seconds * 1000).toISOString()

describe('signeasy transformTemplate', () => {
  it('maps a documented GET /template item', () => {
    const out = TemplateSchema.parse(transformTemplate(LIST_TEMPLATES_EXAMPLE[1]!))
    expect(out.id).toBe('11848')
    expect(out.externalId).toBe('11848')
    expect(out.name).toBe('Payslip information')
    expect(out.signerRoles).toEqual(['HR Head'])
    expect(out.documentCount).toBe(1)
    expect(out.createdAt).toBe(iso(1591811926))
    expect(out.updatedAt).toBe(iso(1591811956))
    expect(out.platform).toBe('signeasy')
  })

  it('maps the documented GET /template/{template_id} detail', () => {
    const out = TemplateSchema.parse(transformTemplate(FETCH_TEMPLATE_EXAMPLE))
    expect(out.id).toBe('11868')
    expect(out.signerRoles).toEqual(['Employee'])
    expect(out.metadata).toEqual({
      isOrdered: 'false',
      isOwned: 'true',
      isPublic: 'false',
      isShared: 'false',
    })
  })

  it('throws on a template without an id', () => {
    expect(() => transformTemplate({ ...FETCH_TEMPLATE_EXAMPLE, id: undefined })).toThrow(/id/)
  })

  it('throws on a template without its documented name instead of serving ""', () => {
    expect(() => transformTemplate({ ...FETCH_TEMPLATE_EXAMPLE, name: undefined })).toThrow(
      /template name/,
    )
  })
})

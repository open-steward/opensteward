import { describe, it, expect } from 'vitest'
import {
  transformTemplate,
  type RawSignRequestTemplate,
} from '../../../../../../../src/verticals/docsign/adapters/signrequest/transform/template'
import { TemplateSchema } from '../../../../../../../src/verticals/docsign/schema/template'

const rawTemplate: RawSignRequestTemplate = {
  uuid: 'tmpl-uuid-abc',
  name: 'Standard NDA',
  who: 'o',
  url: 'https://signrequest.com/templates/tmpl-uuid-abc/',
  team: { subdomain: 'acme', name: 'Acme Corp' },
  user: { email: 'olivia@company.com' },
  created: '2024-01-10T08:00:00.000Z',
}

describe('signrequest transformTemplate', () => {
  it('maps uuid to id and externalId', () => {
    const result = transformTemplate(rawTemplate)
    expect(result.id).toBe('tmpl-uuid-abc')
    expect(result.externalId).toBe('tmpl-uuid-abc')
  })

  it('maps name', () => {
    const result = transformTemplate(rawTemplate)
    expect(result.name).toBe('Standard NDA')
  })

  it('returns empty string for name when null', () => {
    const result = transformTemplate({ ...rawTemplate, name: null })
    expect(result.name).toBe('')
  })

  it('returns empty signerRoles array', () => {
    // SignRequest templates do not expose signer role definitions
    const result = transformTemplate(rawTemplate)
    expect(result.signerRoles).toEqual([])
  })

  it('returns documentCount 0', () => {
    // SignRequest templates do not expose document count
    const result = transformTemplate(rawTemplate)
    expect(result.documentCount).toBe(0)
  })

  it('maps created to createdAt ISO', () => {
    const result = transformTemplate(rawTemplate)
    expect(result.createdAt).toBe('2024-01-10T08:00:00.000Z')
  })

  it('leaves updatedAt undefined (not provided by signrequest)', () => {
    const result = transformTemplate(rawTemplate)
    expect(result.updatedAt).toBeUndefined()
  })

  it('sets platform to signrequest', () => {
    const result = transformTemplate(rawTemplate)
    expect(result.platform).toBe('signrequest')
  })

  it('puts who, url, and team subdomain into metadata', () => {
    const result = transformTemplate(rawTemplate)
    expect(result.metadata.who).toBe('o')
    expect(result.metadata.url).toBe('https://signrequest.com/templates/tmpl-uuid-abc/')
    expect(result.metadata.team).toBe('acme')
  })

  it('passes TemplateSchema.parse without throwing', () => {
    const result = transformTemplate(rawTemplate)
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })
})

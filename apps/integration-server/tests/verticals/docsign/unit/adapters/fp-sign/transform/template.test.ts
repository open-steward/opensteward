import { describe, it, expect } from 'vitest'
import {
  transformTemplate,
  type RawFpSignTemplate,
} from '../../../../../../../src/verticals/docsign/adapters/fp-sign/transform/template'
import { TemplateSchema } from '../../../../../../../src/verticals/docsign/schema/template'

describe('fp-sign transformTemplate', () => {
  const baseRaw: RawFpSignTemplate = {
    id: 20,
    name: 'Standard NDA',
  }

  it('maps id from raw.id', () => {
    const result = transformTemplate(baseRaw)
    expect(result.id).toBe('20')
    expect(result.externalId).toBe('20')
  })

  it('maps name from raw.name', () => {
    const result = transformTemplate(baseRaw)
    expect(result.name).toBe('Standard NDA')
  })

  it('returns empty signerRoles (API only surfaces id+name)', () => {
    const result = transformTemplate(baseRaw)
    expect(result.signerRoles).toEqual([])
  })

  it('returns documentCount of 0', () => {
    const result = transformTemplate(baseRaw)
    expect(result.documentCount).toBe(0)
  })

  it('sets platform to fp-sign', () => {
    const result = transformTemplate(baseRaw)
    expect(result.platform).toBe('fp-sign')
  })

  it('falls back id to empty string when raw.id is absent', () => {
    const result = transformTemplate({ ...baseRaw, id: undefined })
    expect(result.id).toBe('')
  })

  it('falls back name to empty string when raw.name is absent', () => {
    const result = transformTemplate({ ...baseRaw, name: undefined })
    expect(result.name).toBe('')
  })

  it('produces a schema-valid Template', () => {
    const result = transformTemplate(baseRaw)
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })
})

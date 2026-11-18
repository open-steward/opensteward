/**
 * transformTemplate against `TemplateInTemplatesResponseDto`
 * (https://developers.modusign.co.kr/reference/templatecontroller_gettemplates.md).
 */
import { describe, it, expect } from 'vitest'
import { transformTemplate } from '../../../../../../../src/verticals/docsign/adapters/modusign/transform/template'
import { TemplateSchema } from '../../../../../../../src/verticals/docsign/schema/template'
import { listedTemplate } from '../fixtures'

describe('modusign transformTemplate', () => {
  it('maps a documented template row to a canonical Template', () => {
    const out = TemplateSchema.parse(transformTemplate(listedTemplate(1)))
    expect(out).toMatchObject({
      id: 'tpl_1',
      externalId: 'tpl_1',
      name: '템플릿 1',
      signerRoles: ['갑', '을'],
      documentCount: 1,
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-02T00:00:00.000Z',
      platform: 'modusign',
    })
  })

  it('never carries the template file download URL in raw', () => {
    const out = TemplateSchema.parse(transformTemplate(listedTemplate(1)))
    expect(JSON.stringify(out)).not.toContain('downloadUrl')
    expect((out.raw as { id: string }).id).toBe('tpl_1')
  })

  it('throws on a row with no title instead of inventing a name', () => {
    const t = listedTemplate(1) as unknown as Record<string, unknown>
    delete t['title']
    expect(() => transformTemplate(t as never)).toThrow(/title/)
  })
})

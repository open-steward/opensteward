import { describe, it, expect } from 'vitest'
import { transformTemplate } from '../../../../../../../src/verticals/docsign/adapters/namirial/transform/template'
import { TemplateSchema } from '../../../../../../../src/verticals/docsign/schema/template'
import { TEMPLATE_FILES_EXAMPLE, TEMPLATE_GET_EXAMPLE, TEMPLATE_ID } from '../fixtures'

describe('Namirial transformTemplate (GET /v6/template/{id} + /files)', () => {
  it('maps the documented overview and files to a canonical Template', () => {
    const out = TemplateSchema.parse(
      transformTemplate(TEMPLATE_GET_EXAMPLE, TEMPLATE_FILES_EXAMPLE),
    )
    expect(out).toMatchObject({
      id: TEMPLATE_ID,
      externalId: TEMPLATE_ID,
      name: 'NDA',
      signerRoles: ['Customer'],
      documentCount: 2,
      createdAt: '2017-07-21T17:32:28.000Z',
      platform: 'namirial',
    })
    expect(out.description).toBeUndefined()
    expect(out.updatedAt).toBeUndefined()
  })

  it('throws instead of inventing an id or name', () => {
    expect(() =>
      transformTemplate({ ...TEMPLATE_GET_EXAMPLE, Id: undefined }, TEMPLATE_FILES_EXAMPLE),
    ).toThrow(/no Id/)
    expect(() =>
      transformTemplate({ ...TEMPLATE_GET_EXAMPLE, Name: undefined }, TEMPLATE_FILES_EXAMPLE),
    ).toThrow(/no Name/)
    expect(transformTemplate(TEMPLATE_GET_EXAMPLE, {}).documentCount).toBe(0)
  })
})

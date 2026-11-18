import { describe, it, expect } from 'vitest'
import { TemplateSchema } from '../../../../../../../src/verticals/docsign/schema/template'
import { transformTemplate } from '../../../../../../../src/verticals/docsign/adapters/visma-sign/transform/template'
import { invitationTemplate } from '../fixtures'

describe('visma-sign transformTemplate', () => {
  it('maps the documented "Get invitation templates" example onto a valid Template', () => {
    const out = TemplateSchema.parse(transformTemplate(invitationTemplate()))
    expect(out).toMatchObject({
      id: 'ad12596d-f819-4b06-9862-d080ee27aebd',
      externalId: 'ad12596d-f819-4b06-9862-d080ee27aebd',
      name: 'Testi',
      signerRoles: [],
      documentCount: 0,
      platform: 'visma-sign',
      metadata: { editedOn: '2020-02-07 19:47:04' },
    })
    // edited_on has no zone, so it is not parsed into a timestamp.
    expect(out.updatedAt).toBeUndefined()
    expect(out.createdAt).toBeUndefined()
  })
})

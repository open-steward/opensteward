import { describe, it, expect } from 'vitest'
import { transformMacro } from '../../../../../../../src/verticals/customer-support/adapters/intercom/transform/macro'
import { MacroSchema } from '../../../../../../../src/verticals/customer-support/schema/macro'

describe('transformMacro (Intercom macro)', () => {
  it('prefers the plain-text body and parses', () => {
    const m = MacroSchema.parse(
      transformMacro({
        type: 'macro',
        id: '123',
        name: 'Order Status Update',
        body: '<p>Hi <attribute key="user.name" default="there"/></p>',
        body_text: 'Hi {{user.name|fallback:"there"}}',
        created_at: '2025-07-17T11:18:08.000Z',
        updated_at: '2025-07-17T15:30:24.000Z',
        visible_to: 'everyone',
        available_on: ['inbox', 'messenger'],
      }),
    )
    expect(m).toMatchObject({
      id: '123',
      externalId: '123',
      title: 'Order Status Update',
      body: 'Hi {{user.name|fallback:"there"}}',
      platform: 'intercom',
    })
    expect(m.metadata).toEqual({
      visibleTo: 'everyone',
      availableOn: 'inbox,messenger',
      createdAt: '2025-07-17T11:18:08.000Z',
      updatedAt: '2025-07-17T15:30:24.000Z',
    })
  })

  it('falls back to the HTML body when there is no plain text', () => {
    expect(
      MacroSchema.parse(transformMacro({ id: 1, name: 'x', body: '<p>b</p>', body_text: null }))
        .body,
    ).toBe('<p>b</p>')
  })
})

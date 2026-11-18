import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import { transformTouchpoint } from '../../../../../../../src/verticals/crm/adapters/cobra-crm/transform/touchpoint'

/**
 * A `TouchpointForDetailedDto`, fields as declared at https://apis.cobra-hilfe.de/api-7858744.md
 * (`channel` is a `TelephoneCallDto`, whose declared properties include
 * `startTime`, `endTime`, `channel` and `phoneNumber`). The docs give no values
 * for `touchType` (only "type: string, readOnly: true, nullable: true"), so the
 * fixture uses an opaque placeholder: the transform passes it through unchanged.
 */
const TOUCH_TYPE = 'opaque-touchType-from-upstream'
const TOUCHPOINT = {
  id: '65d3151fd6a8b43e0c7a3d03',
  topic: 'Discovery call',
  details: 'Discussed the Q3 rollout.',
  source: null,
  touchDate: '2024-02-19T00:00:00Z',
  priority: 'Normal',
  isOutgoing: true,
  channel: {
    identifier: 'TelephoneCallDto',
    displayName: 'Telephone call',
    touchType: TOUCH_TYPE,
    startTime: '2024-02-19T08:30:00Z',
    endTime: '2024-02-19T08:45:00Z',
    channel: 'Telephone',
    phoneNumber: '+4930222222',
  },
  created: { date: '2024-02-19T08:57:43.041Z', userId: 'c0316f28-4d2d-4c79-b5fc-bd25f2bca40c' },
  modified: { date: '2024-03-01T10:00:00Z', userId: 'c0316f28-4d2d-4c79-b5fc-bd25f2bca40c' },
}

describe('cobra-crm transformTouchpoint', () => {
  it('maps a documented touchpoint onto a schema-valid Activity', () => {
    const a = ActivitySchema.parse(transformTouchpoint(TOUCHPOINT))
    expect(a).toMatchObject({
      id: '65d3151fd6a8b43e0c7a3d03',
      type: TOUCH_TYPE,
      subject: 'Discovery call',
      note: 'Discussed the Q3 rollout.',
      created_at: '2024-02-19T08:57:43.041Z',
      updated_at: '2024-03-01T10:00:00Z',
    })
    expect(a.metadata).toEqual(TOUCHPOINT)
  })

  it('refuses a touchpoint without an id', () => {
    expect(() => transformTouchpoint({ ...TOUCHPOINT, id: null })).toThrow(/no id/)
  })
})

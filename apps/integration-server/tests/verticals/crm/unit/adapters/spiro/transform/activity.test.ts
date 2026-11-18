import { describe, it, expect } from 'vitest'
import {
  transformActivity,
  untransformActivity,
  type RawSpiroActivity,
} from '../../../../../../../src/verticals/crm/adapters/spiro/transform/activity'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import { ACTIVITIES_LIST } from '../fixtures'

const LISTED: RawSpiroActivity = ACTIVITIES_LIST.data[0]

describe('spiro transformActivity (documented GET /api/v1/activities example)', () => {
  it('parses against ActivitySchema with every documented field in place', () => {
    const a = ActivitySchema.parse(transformActivity(LISTED))
    expect(a).toMatchObject({
      id: '151',
      subject: 'ipsam',
      note: 'Tempore tempora accusantium aperiam.',
      owner_id: '956',
    })
    expect(a.metadata).toEqual(LISTED)
  })

  it('does not report the JSON:API resource type as the activity kind', () => {
    expect(transformActivity(LISTED).type).toBeUndefined()
  })

  it('leaves subject and note unset when Spiro sends null', () => {
    const a = transformActivity({
      ...LISTED,
      attributes: { ...LISTED.attributes, subject: null, description: null },
    })
    ActivitySchema.parse(a)
    expect(a.subject).toBeUndefined()
    expect(a.note).toBeUndefined()
  })
})

describe('spiro untransformActivity', () => {
  it('maps deal_id back to opportunity_id', () => {
    const result = untransformActivity({ deal_id: '33' })
    expect(result.opportunity_id).toBe('33')
  })

  it('maps done back to completed', () => {
    const result = untransformActivity({ done: true })
    expect(result.completed).toBe(true)
  })

  it('maps note back to description', () => {
    const result = untransformActivity({ note: 'Call summary' })
    expect(result.description).toBe('Call summary')
  })

  it('omits undefined fields', () => {
    const result = untransformActivity({})
    expect(Object.keys(result)).toHaveLength(0)
  })
})

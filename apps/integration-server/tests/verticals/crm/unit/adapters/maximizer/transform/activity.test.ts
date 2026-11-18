import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import {
  transformActivity,
  untransformActivity,
} from '../../../../../../../src/verticals/crm/adapters/maximizer/transform/activity'
import { documentedTask } from '../fixtures/documented'

describe('maximizer transformActivity (Octopus Task)', () => {
  it('maps the documented Task fields and parses as an Activity', () => {
    const out = ActivitySchema.parse(transformActivity(documentedTask()))
    expect(out).toMatchObject({ id: 'VGFzawkzNQ==', type: 'task', subject: 'Call', done: false })
  })

  it('leaves a date-only DateTime out rather than guessing a zone', () => {
    expect(transformActivity(documentedTask()).due_date).toBeUndefined()
  })

  it('maps a DateTime that states its zone', () => {
    const raw = { ...documentedTask(), DateTime: '2015-01-20T20:37:51Z' }
    expect(transformActivity(raw).due_date).toBe('2015-01-20T20:37:51.000Z')
  })

  it('keeps the raw row as metadata', () => {
    const raw = documentedTask()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('untransform is unchanged (write path, out of scope)', () => {
    expect(untransformActivity({ subject: 'S' })).toEqual({ Subject: 'S' })
  })
})

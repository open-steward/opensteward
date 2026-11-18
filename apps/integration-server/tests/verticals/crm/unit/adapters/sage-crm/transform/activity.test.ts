import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import {
  transformActivity,
  untransformActivity,
} from '../../../../../../../src/verticals/crm/adapters/sage-crm/transform/activity'
import { communication } from '../fixtures/documented'

describe('sage-crm transformActivity (documented Communication)', () => {
  it('maps the documented Communication fields and parses as a canonical Activity', () => {
    const raw = communication(30)
    const out = ActivitySchema.parse(transformActivity(raw))
    expect(out).toEqual({
      id: '30',
      type: 'task',
      subject: 'My task 30',
      note: 'Call back about the quote',
      owner_id: '1',
      deal_id: '12',
      due_date: '2020-10-06T07:30:00.000Z',
      created_at: '2020-10-01T08:00:00.000Z',
      updated_at: '2020-10-02T08:00:00.000Z',
      metadata: raw,
    })
  })

  it('does not infer done from the undocumented Comm_Status vocabulary', () => {
    expect(transformActivity(communication(1)).done).toBeUndefined()
  })

  it('throws without Comm_CommunicationId', () => {
    const { Comm_CommunicationId: _omit, ...raw } = communication(1)
    expect(() => transformActivity(raw)).toThrow(/Comm_CommunicationId/)
  })

  it('untransform keeps its previous (write-path) mapping', () => {
    expect(untransformActivity({ subject: 'S' })).toEqual({ acti_subject: 'S' })
  })
})

import { describe, it, expect } from 'vitest'
import {
  transformActivity,
  untransformActivity,
  type RawRespondIoActivity,
} from '../../../../../../../src/verticals/crm/adapters/respond-io/transform/activity'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'

describe('respond-io transformActivity', () => {
  it('maps id to string', () => {
    expect(transformActivity({ id: 99 }).id).toBe('99')
  })

  it('maps type and subject', () => {
    const result = transformActivity({ id: '1', type: 'call', subject: 'Discovery' })
    expect(result.type).toBe('call')
    expect(result.subject).toBe('Discovery')
  })

  it('maps note', () => {
    expect(transformActivity({ id: '1', note: 'Some note' }).note).toBe('Some note')
  })

  it('maps contactId to contact_id string', () => {
    expect(transformActivity({ id: '1', contactId: 7 }).contact_id).toBe('7')
  })

  it('maps dueDate', () => {
    expect(transformActivity({ id: '1', dueDate: '2024-03-01' }).due_date).toBe('2024-03-01')
  })

  it('preserves raw metadata', () => {
    const raw: RawRespondIoActivity = { id: '5', type: 'task' }
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('produces schema-valid output', () => {
    const raw: RawRespondIoActivity = {
      id: '10',
      type: 'meeting',
      subject: 'Kick-off',
      note: 'Discuss scope',
      contactId: '3',
    }
    expect(() => ActivitySchema.parse(transformActivity(raw))).not.toThrow()
  })
})

describe('respond-io untransformActivity', () => {
  it('maps subject', () => {
    expect(untransformActivity({ subject: 'Follow-up' })).toMatchObject({ subject: 'Follow-up' })
  })

  it('maps note', () => {
    expect(untransformActivity({ note: 'Call later' })).toMatchObject({ note: 'Call later' })
  })

  it('omits unset fields', () => {
    const result = untransformActivity({})
    expect(result).not.toHaveProperty('subject')
    expect(result).not.toHaveProperty('note')
  })
})

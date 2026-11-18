import { describe, it, expect } from 'vitest'
import {
  transformActivity,
  untransformActivity,
  type RawBoondManagerAction,
} from '../../../../../../../src/verticals/crm/adapters/boondmanager/transform/activity'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'

function makeRaw(
  overrides: Partial<RawBoondManagerAction['attributes']> = {},
  rels: RawBoondManagerAction['relationships'] = {},
): RawBoondManagerAction {
  return {
    id: 'act-1',
    type: 'action',
    attributes: { ...overrides },
    relationships: rels,
  }
}

describe('boondmanager transformActivity', () => {
  it('maps id to string', () => {
    const raw: RawBoondManagerAction = {
      id: '42',
      type: 'action',
      attributes: {},
    }
    expect(transformActivity(raw).id).toBe('42')
  })

  it('maps typeOf to type', () => {
    expect(transformActivity(makeRaw({ typeOf: 'call' })).type).toBe('call')
    expect(transformActivity(makeRaw({ typeOf: 'email' })).type).toBe('email')
  })

  it('maps subject', () => {
    expect(transformActivity(makeRaw({ subject: 'Discovery call' })).subject).toBe('Discovery call')
  })

  it('maps content to note', () => {
    expect(transformActivity(makeRaw({ content: 'Body text' })).note).toBe('Body text')
  })

  it('maps contact relationship to contact_id', () => {
    const result = transformActivity(
      makeRaw({}, { contact: { data: { id: 'c-77', type: 'contact' } } }),
    )
    expect(result.contact_id).toBe('c-77')
  })

  it('maps company relationship to company_id', () => {
    const result = transformActivity(
      makeRaw({}, { company: { data: { id: 'co-55', type: 'company' } } }),
    )
    expect(result.company_id).toBe('co-55')
  })

  it('maps mainManager relationship to owner_id', () => {
    const result = transformActivity(
      makeRaw({}, { mainManager: { data: { id: 'u-7', type: 'staff' } } }),
    )
    expect(result.owner_id).toBe('u-7')
  })

  it('uses endDate as due_date when present', () => {
    const result = transformActivity(
      makeRaw({ endDate: '2026-03-01T10:00:00Z', startDate: '2026-02-01T10:00:00Z' }),
    )
    expect(result.due_date).toMatch(/2026-03-01/)
  })

  it('falls back to startDate when endDate absent', () => {
    const result = transformActivity(makeRaw({ startDate: '2026-02-01T10:00:00Z' }))
    expect(result.due_date).toMatch(/2026-02-01/)
  })

  it('converts creationDate to created_at', () => {
    const result = transformActivity(makeRaw({ creationDate: '2026-01-15T09:30:00Z' }))
    expect(result.created_at).toMatch(/2026-01-15/)
  })

  it('converts updateDate to updated_at', () => {
    const result = transformActivity(makeRaw({ updateDate: '2026-02-01T14:20:00Z' }))
    expect(result.updated_at).toMatch(/2026-02-01/)
  })

  it('passes ActivitySchema.parse without throwing', () => {
    const raw = makeRaw(
      {
        typeOf: 'meeting',
        subject: 'Kickoff meeting',
        content: 'Agenda items',
        endDate: '2026-03-01T10:00:00Z',
        creationDate: '2026-01-15T09:30:00Z',
        updateDate: '2026-02-01T14:20:00Z',
      },
      {
        contact: { data: { id: 'c-1', type: 'contact' } },
        mainManager: { data: { id: 'u-1', type: 'staff' } },
      },
    )
    expect(() => ActivitySchema.parse(transformActivity(raw))).not.toThrow()
  })
})

describe('boondmanager untransformActivity', () => {
  it('maps type back to typeOf', () => {
    expect(untransformActivity({ type: 'call' })['typeOf']).toBe('call')
  })

  it('maps subject back', () => {
    expect(untransformActivity({ subject: 'Subject' })['subject']).toBe('Subject')
  })

  it('maps note back to content', () => {
    expect(untransformActivity({ note: 'Body text' })['content']).toBe('Body text')
  })

  it('maps due_date back to endDate', () => {
    expect(untransformActivity({ due_date: '2026-03-01T00:00:00.000Z' })['endDate']).toBe(
      '2026-03-01T00:00:00.000Z',
    )
  })

  it('round-trips type, subject, note', () => {
    const raw = makeRaw({ typeOf: 'email', subject: 'Re: Proposal', content: 'See attached' })
    const canonical = transformActivity(raw)
    const back = untransformActivity(canonical)
    expect(back['typeOf']).toBe('email')
    expect(back['subject']).toBe('Re: Proposal')
    expect(back['content']).toBe('See attached')
  })
})

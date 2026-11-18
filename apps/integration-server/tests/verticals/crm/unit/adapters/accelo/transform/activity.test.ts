import { describe, it, expect } from 'vitest'
import {
  transformActivity,
  untransformActivity,
  type RawAcceloActivity,
} from '../../../../../../../src/verticals/crm/adapters/accelo/transform/activity'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'

function makeRaw(overrides: Partial<RawAcceloActivity> = {}): RawAcceloActivity {
  return { id: 'act-1', ...overrides }
}

describe('accelo transformActivity', () => {
  it('maps id to string', () => {
    expect(transformActivity(makeRaw({ id: 42 })).id).toBe('42')
  })

  it('maps medium "Email" to type "email"', () => {
    expect(transformActivity(makeRaw({ medium: 'Email' })).type).toBe('email')
  })

  it('maps medium "Meeting" to type "meeting"', () => {
    expect(transformActivity(makeRaw({ medium: 'Meeting' })).type).toBe('meeting')
  })

  it('maps medium "Call" to type "call"', () => {
    expect(transformActivity(makeRaw({ medium: 'Call' })).type).toBe('call')
  })

  it('defaults to type "note" when medium absent', () => {
    expect(transformActivity(makeRaw()).type).toBe('note')
  })

  it('maps subject', () => {
    expect(transformActivity(makeRaw({ subject: 'Discovery call' })).subject).toBe('Discovery call')
  })

  it('maps body to note', () => {
    expect(transformActivity(makeRaw({ body: 'Follow-up notes' })).note).toBe('Follow-up notes')
  })

  it('maps owner_id to string', () => {
    expect(transformActivity(makeRaw({ owner_id: 99 })).owner_id).toBe('99')
  })

  it('resolves against_type=contact to contact_id', () => {
    const result = transformActivity(makeRaw({ against_type: 'contact', against_id: '77' }))
    expect(result.contact_id).toBe('77')
    expect(result.company_id).toBeUndefined()
  })

  it('resolves against_type=company to company_id', () => {
    const result = transformActivity(makeRaw({ against_type: 'company', against_id: '88' }))
    expect(result.company_id).toBe('88')
    expect(result.contact_id).toBeUndefined()
  })

  it('resolves against_type=prospect to deal_id', () => {
    const result = transformActivity(makeRaw({ against_type: 'prospect', against_id: '55' }))
    expect(result.deal_id).toBe('55')
  })

  it('done=true when standing is "complete"', () => {
    expect(transformActivity(makeRaw({ standing: 'complete' })).done).toBe(true)
    expect(transformActivity(makeRaw({ standing: 'sent' })).done).toBe(true)
    expect(transformActivity(makeRaw({ standing: 'approved' })).done).toBe(true)
  })

  it('done=false when standing is "draft"', () => {
    expect(transformActivity(makeRaw({ standing: 'draft' })).done).toBe(false)
  })

  it('sums billable + nonbillable seconds and converts to minutes', () => {
    // 3600 + 1800 = 5400 seconds => 90 minutes
    const result = transformActivity(makeRaw({ billable: '3600', nonbillable: '1800' }))
    expect(result.duration_minutes).toBe(90)
  })

  it('returns undefined duration when both are zero', () => {
    expect(
      transformActivity(makeRaw({ billable: '0', nonbillable: '0' })).duration_minutes,
    ).toBeUndefined()
  })

  it('converts unix timestamp date_created to ISO', () => {
    // 1737000000 ~ 2025-01-16
    const result = transformActivity(makeRaw({ date_created: 1737000000 }))
    expect(result.created_at).toMatch(/\d{4}-\d{2}-\d{2}/)
  })

  it('passes ActivitySchema.parse without throwing', () => {
    const raw = makeRaw({
      id: '10',
      medium: 'Call',
      subject: 'Discovery call',
      body: 'Discussed Q1',
      owner_id: '5',
      against_type: 'contact',
      against_id: '77',
      standing: 'complete',
      billable: '1800',
      nonbillable: '600',
      date_created: 1737000000,
      date_modified: 1737086400,
    })
    expect(() => ActivitySchema.parse(transformActivity(raw))).not.toThrow()
  })
})

describe('accelo untransformActivity', () => {
  it('maps subject back', () => {
    expect(untransformActivity({ subject: 'Call subject' }).subject).toBe('Call subject')
  })

  it('maps note back to body', () => {
    expect(untransformActivity({ note: 'Body text' }).body).toBe('Body text')
  })

  it('maps type=email to medium=Email', () => {
    expect(untransformActivity({ type: 'email' }).medium).toBe('Email')
  })

  it('maps type=call to medium=Call', () => {
    expect(untransformActivity({ type: 'call' }).medium).toBe('Call')
  })

  it('maps unknown type to medium=Note', () => {
    expect(untransformActivity({ type: 'lunch' }).medium).toBe('Note')
  })

  it('maps contact_id to against_type=contact', () => {
    const result = untransformActivity({ contact_id: 'c-1' })
    expect(result.against_type).toBe('contact')
    expect(result.against_id).toBe('c-1')
  })

  it('maps company_id to against_type=company', () => {
    const result = untransformActivity({ company_id: 'co-2' })
    expect(result.against_type).toBe('company')
    expect(result.against_id).toBe('co-2')
  })

  it('maps deal_id to against_type=prospect', () => {
    const result = untransformActivity({ deal_id: 'd-3' })
    expect(result.against_type).toBe('prospect')
    expect(result.against_id).toBe('d-3')
  })
})

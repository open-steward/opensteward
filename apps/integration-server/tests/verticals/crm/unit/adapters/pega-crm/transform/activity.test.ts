import { describe, it, expect } from 'vitest'
import {
  transformActivity,
  untransformActivity,
  type RawPegaTask,
} from '../../../../../../../src/verticals/crm/adapters/pega-crm/transform/activity'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'

function makeRaw(overrides: Partial<RawPegaTask> = {}): RawPegaTask {
  return {
    pzInsKey: 'TASK-1001',
    pyID: 'T-1001',
    pyLabel: 'Discovery call',
    TaskType: 'Call',
    pyNote: 'Follow up on budget',
    pyDueDate: '20260201T140000.000 GMT',
    pyStatusWork: 'Open-New',
    pyOwner: 'operator1',
    ContactID: 'CONT-42',
    AccountID: 'ACCT-7',
    OpportunityID: 'OPP-99',
    pxCreateDateTime: '20260115T093000.000 GMT',
    pxUpdateDateTime: '20260120T120000.000 GMT',
    ...overrides,
  }
}

describe('pega-crm transformActivity', () => {
  it('maps id from pzInsKey', () => {
    expect(transformActivity(makeRaw()).id).toBe('TASK-1001')
  })

  it('falls back to pyID when pzInsKey is absent', () => {
    expect(transformActivity(makeRaw({ pzInsKey: undefined })).id).toBe('T-1001')
  })

  it('maps TaskType "Call" to canonical "call"', () => {
    expect(transformActivity(makeRaw()).type).toBe('call')
  })

  it('maps TaskType "Email" to canonical "email"', () => {
    expect(transformActivity(makeRaw({ TaskType: 'Email' })).type).toBe('email')
  })

  it('maps TaskType "Meeting" to canonical "meeting"', () => {
    expect(transformActivity(makeRaw({ TaskType: 'Meeting' })).type).toBe('meeting')
  })

  it('maps unknown TaskType to "task"', () => {
    expect(transformActivity(makeRaw({ TaskType: 'Custom' })).type).toBe('task')
  })

  it('maps absent TaskType to "task"', () => {
    expect(transformActivity(makeRaw({ TaskType: undefined })).type).toBe('task')
  })

  it('maps subject from pyLabel', () => {
    expect(transformActivity(makeRaw()).subject).toBe('Discovery call')
  })

  it('maps note from pyNote', () => {
    expect(transformActivity(makeRaw()).note).toBe('Follow up on budget')
  })

  it('maps contact_id from ContactID', () => {
    expect(transformActivity(makeRaw()).contact_id).toBe('CONT-42')
  })

  it('maps company_id from AccountID', () => {
    expect(transformActivity(makeRaw()).company_id).toBe('ACCT-7')
  })

  it('maps deal_id from OpportunityID', () => {
    expect(transformActivity(makeRaw()).deal_id).toBe('OPP-99')
  })

  it('maps owner_id from pyOwner', () => {
    expect(transformActivity(makeRaw()).owner_id).toBe('operator1')
  })

  it('maps done=false when status is Open-New', () => {
    expect(transformActivity(makeRaw({ pyStatusWork: 'Open-New' })).done).toBe(false)
  })

  it('maps done=true when status starts with Resolved-', () => {
    expect(transformActivity(makeRaw({ pyStatusWork: 'Resolved-Completed' })).done).toBe(true)
  })

  it('parses Pega compact datetime for due_date', () => {
    const result = transformActivity(makeRaw())
    expect(result.due_date).toBe('2026-02-01T14:00:00.000Z')
  })

  it('parses Pega compact datetime for created_at', () => {
    expect(transformActivity(makeRaw()).created_at).toBe('2026-01-15T09:30:00.000Z')
  })

  it('passes ActivitySchema validation', () => {
    expect(() => ActivitySchema.parse(transformActivity(makeRaw()))).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('untransformActivity round-trips subject', () => {
    const result = untransformActivity({ subject: 'Test call' })
    expect((result as { content: Record<string, unknown> }).content.pyLabel).toBe('Test call')
  })

  it('untransformActivity sets pyStatusWork Resolved-Completed when done=true', () => {
    const result = untransformActivity({ done: true })
    expect((result as { content: Record<string, unknown> }).content.pyStatusWork).toBe(
      'Resolved-Completed',
    )
  })

  it('untransformActivity sets pyStatusWork Open-New when done=false', () => {
    const result = untransformActivity({ done: false })
    expect((result as { content: Record<string, unknown> }).content.pyStatusWork).toBe('Open-New')
  })
})

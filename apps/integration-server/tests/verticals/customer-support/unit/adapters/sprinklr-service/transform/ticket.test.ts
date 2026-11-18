import { describe, it, expect } from 'vitest'
import { TicketSchema } from '../../../../../../../src/verticals/customer-support/schema/ticket'
import { transformTicket } from '../../../../../../../src/verticals/customer-support/adapters/sprinklr-service/transform/ticket'
import { DOC_CASE } from '../fixtures'

describe('transformTicket (Sprinklr GET /api/v2/case/{caseId})', () => {
  it('maps the documented example case and parses as a canonical Ticket', () => {
    const out = TicketSchema.parse(transformTicket(DOC_CASE))
    expect(out.id).toBe('00000197203b3fe5e4b0324aec609fcf')
    expect(out.externalId).toBe('00000197203b3fe5e4b0324aec609fcf')
    expect(out.number).toBe('7030591')
    expect(out.subject).toBe('#7030591 Sprinklr_voice ')
    expect(out.priority).toBe('high')
    expect(out.channel).toBe('voice')
    expect(out.requesterId).toBe('SPRINKLR_VOICE___SPR_DEFAULT_PROFILE__')
    expect(out.assigneeId).toBe('66007905')
    expect(out.teamId).toBeUndefined()
    expect(out.createdAt).toBe(new Date(1870316100000).toISOString())
    expect(out.updatedAt).toBe(new Date(1749644307104).toISOString())
    expect(out.resolvedAt).toBeUndefined()
    expect(out.metadata).toMatchObject({
      caseStatus: 'Archived',
      casePriority: 'High',
      channelType: 'SPRINKLR_VOICE',
      assigneeType: 'USER',
    })
  })

  it('maps the documented states Open, Pending and Closed, and anything else to unknown', () => {
    const status = (s: string) =>
      TicketSchema.parse(transformTicket({ ...DOC_CASE, status: s })).status
    expect(status('Open')).toBe('open')
    expect(status('Pending')).toBe('pending')
    expect(status('Closed')).toBe('closed')
    expect(status('Archived')).toBe('unknown')
  })

  it('maps only the documented priority (High) and channel (SPRINKLR_VOICE); the rest to unknown', () => {
    const map = (priority: string, channelType: string) =>
      TicketSchema.parse(
        transformTicket({ ...DOC_CASE, priority, contact: { ...DOC_CASE.contact, channelType } }),
      )
    expect(map('High', 'SPRINKLR_VOICE')).toMatchObject({ priority: 'high', channel: 'voice' })
    for (const p of ['Low', 'Normal', 'Urgent', 'Medium'])
      expect(map(p, 'X').priority).toBe('unknown')
    for (const c of ['FACEBOOK', 'TWITTER', 'INSTAGRAM', 'sprinklr_voice'])
      expect(map('High', c).channel).toBe('unknown')
  })

  it('reads the team from the documented workflow.queues[].queueId', () => {
    const out = transformTicket({
      ...DOC_CASE,
      workflow: { assignment: null, queues: [{ queueId: 4242, assignmentTime: 1749111272934 }] },
    })
    expect(TicketSchema.parse(out).teamId).toBe('4242')
  })

  it('throws instead of inventing a requester, id or creation time', () => {
    expect(() => transformTicket({ ...DOC_CASE, contact: null })).toThrow(/contact\.id/)
    expect(() => transformTicket({ ...DOC_CASE, id: undefined })).toThrow(/no id/)
    expect(() => transformTicket({ ...DOC_CASE, createdTime: undefined })).toThrow(/createdTime/)
  })
})

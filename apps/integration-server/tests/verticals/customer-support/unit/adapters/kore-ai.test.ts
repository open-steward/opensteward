import { describe, it, expect } from 'vitest'
import { transformTicket } from '../../../../../src/verticals/customer-support/adapters/kore-ai/transform/ticket'
import { transformMessage } from '../../../../../src/verticals/customer-support/adapters/kore-ai/transform/message'
import { transformContact } from '../../../../../src/verticals/customer-support/adapters/kore-ai/transform/contact'
import { transformUser } from '../../../../../src/verticals/customer-support/adapters/kore-ai/transform/user'
import { transformTeam } from '../../../../../src/verticals/customer-support/adapters/kore-ai/transform/team'

// ---------------------------------------------------------------------------
// transformTicket
// ---------------------------------------------------------------------------

describe('Kore.ai transformTicket', () => {
  it('maps _id to id', () => {
    const out = transformTicket({ _id: 'conv-123' })
    expect(out.id).toBe('conv-123')
    expect(out.externalId).toBe('conv-123')
    expect(out.platform).toBe('kore-ai')
  })

  it('falls back to conversationId when _id is absent', () => {
    const out = transformTicket({ conversationId: 'cid-456' })
    expect(out.id).toBe('cid-456')
  })

  it('maps status ACTIVE → open', () => {
    expect(transformTicket({ _id: '1', status: 'ACTIVE' }).status).toBe('open')
  })

  it('maps status OPEN → open', () => {
    expect(transformTicket({ _id: '2', status: 'OPEN' }).status).toBe('open')
  })

  it('maps status IDLE → pending', () => {
    expect(transformTicket({ _id: '3', status: 'IDLE' }).status).toBe('pending')
  })

  it('maps status CLOSED → closed', () => {
    expect(transformTicket({ _id: '4', status: 'CLOSED' }).status).toBe('closed')
  })

  it('maps status TERMINATED → closed', () => {
    expect(transformTicket({ _id: '5', status: 'TERMINATED' }).status).toBe('closed')
  })

  it('maps status OVERDUE → open (still active)', () => {
    expect(transformTicket({ _id: '6', status: 'OVERDUE' }).status).toBe('open')
  })

  it('maps priority 0 → low', () => {
    expect(transformTicket({ _id: '7', priority: 0 }).priority).toBe('low')
  })

  it('maps priority 1 → low', () => {
    expect(transformTicket({ _id: '8', priority: 1 }).priority).toBe('low')
  })

  it('maps priority 2 → normal', () => {
    expect(transformTicket({ _id: '9', priority: 2 }).priority).toBe('normal')
  })

  it('maps priority 3 → high', () => {
    expect(transformTicket({ _id: '10', priority: 3 }).priority).toBe('high')
  })

  it('maps priority 4 → urgent', () => {
    expect(transformTicket({ _id: '11', priority: 4 }).priority).toBe('urgent')
  })

  it('returns undefined priority when null', () => {
    expect(transformTicket({ _id: '12', priority: null }).priority).toBeUndefined()
  })

  it('maps source=email → channel=email', () => {
    expect(transformTicket({ _id: '13', source: 'email' }).channel).toBe('email')
  })

  it('maps source=webchat → channel=chat', () => {
    expect(transformTicket({ _id: '14', source: 'webchat' }).channel).toBe('chat')
  })

  it('maps source=voice → channel=voice', () => {
    expect(transformTicket({ _id: '15', source: 'voice' }).channel).toBe('voice')
  })

  it('maps source=sms → channel=sms', () => {
    expect(transformTicket({ _id: '16', source: 'sms' }).channel).toBe('sms')
  })

  it('maps source=twitter → channel=social', () => {
    expect(transformTicket({ _id: '17', source: 'twitter' }).channel).toBe('social')
  })

  it('maps source=api → channel=api', () => {
    expect(transformTicket({ _id: '18', source: 'api' }).channel).toBe('api')
  })

  it('maps unknown source → channel=other', () => {
    expect(transformTicket({ _id: '19', source: 'fax' }).channel).toBe('other')
  })

  it('maps userId to requesterId', () => {
    const out = transformTicket({ _id: '20', userId: 'u-999' })
    expect(out.requesterId).toBe('u-999')
  })

  it('maps first ASSIGNED participant to assigneeId', () => {
    const out = transformTicket({
      _id: '21',
      participants: [{ agentId: 'a-1', status: 'ASSIGNED' }],
    })
    expect(out.assigneeId).toBe('a-1')
  })

  it('maps first queue id to teamId', () => {
    const out = transformTicket({ _id: '22', queues: [{ id: 'q-5', name: 'Billing' }] })
    expect(out.teamId).toBe('q-5')
  })

  it('sets resolvedAt when status is CLOSED', () => {
    const out = transformTicket({
      _id: '23',
      status: 'CLOSED',
      endTime: '2026-01-01T00:00:00Z',
    })
    expect(out.resolvedAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('does not set resolvedAt when status is open', () => {
    const out = transformTicket({ _id: '24', status: 'ACTIVE' })
    expect(out.resolvedAt).toBeUndefined()
  })

  it('createdAt falls back to startTime', () => {
    const out = transformTicket({ _id: '25', startTime: '2026-02-01T08:00:00Z' })
    expect(out.createdAt).toBe('2026-02-01T08:00:00.000Z')
  })

  it('tagIds is always an empty array', () => {
    const out = transformTicket({ _id: '26' })
    expect(out.tagIds).toEqual([])
  })

  it('raw is preserved', () => {
    const raw = { _id: '27', status: 'OPEN' }
    expect(transformTicket(raw).raw).toBe(raw)
  })

  it('does not throw on empty input', () => {
    expect(() => transformTicket({})).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// transformMessage
// ---------------------------------------------------------------------------

describe('Kore.ai transformMessage', () => {
  it('maps _id to id', () => {
    const out = transformMessage({ _id: 'msg-1' }, 'tkt-1')
    expect(out.id).toBe('msg-1')
    expect(out.ticketId).toBe('tkt-1')
    expect(out.platform).toBe('kore-ai')
  })

  it('maps messageId when _id is absent', () => {
    const out = transformMessage({ messageId: 'mid-99' }, 'tkt-2')
    expect(out.id).toBe('mid-99')
  })

  it('extracts body from components[].data.text', () => {
    const out = transformMessage(
      { _id: 'm1', components: [{ componentType: 'text', data: { text: 'Hello!' } }] },
      'tkt-3',
    )
    expect(out.body).toBe('Hello!')
  })

  it('falls back body to message field', () => {
    const out = transformMessage({ _id: 'm2', message: 'Hi there' }, 'tkt-3')
    expect(out.body).toBe('Hi there')
  })

  it('falls back body to note field', () => {
    const out = transformMessage({ _id: 'm3', note: 'Internal note text' }, 'tkt-3')
    expect(out.body).toBe('Internal note text')
  })

  it('maps type=note to MessageType=internal', () => {
    const out = transformMessage({ _id: 'm4', type: 'note' }, 'tkt-4')
    expect(out.type).toBe('internal')
  })

  it('maps type=outgoing to authorType=agent', () => {
    const out = transformMessage({ _id: 'm5', type: 'outgoing' }, 'tkt-4')
    expect(out.authorType).toBe('agent')
  })

  it('maps author.type=bot to authorType=bot', () => {
    const out = transformMessage({ _id: 'm6', author: { type: 'bot', id: 'bot-1' } }, 'tkt-4')
    expect(out.authorType).toBe('bot')
  })

  it('maps incoming type to authorType=user', () => {
    const out = transformMessage({ _id: 'm7', type: 'incoming' }, 'tkt-4')
    expect(out.authorType).toBe('user')
  })

  it('maps agentId to authorId', () => {
    const out = transformMessage({ _id: 'm8', agentId: 'agent-7' }, 'tkt-5')
    expect(out.authorId).toBe('agent-7')
  })

  it('maps numeric createdOn as epoch ms to ISO', () => {
    const epochMs = new Date('2026-03-01T10:00:00Z').getTime()
    const out = transformMessage({ _id: 'm9', createdOn: epochMs }, 'tkt-6')
    expect(out.createdAt).toBe('2026-03-01T10:00:00.000Z')
  })

  it('maps string createdOn to ISO', () => {
    const out = transformMessage({ _id: 'm10', createdOn: '2026-04-15T14:00:00Z' }, 'tkt-7')
    expect(out.createdAt).toBe('2026-04-15T14:00:00.000Z')
  })

  it('does not throw on empty input', () => {
    expect(() => transformMessage({}, 'tkt-min')).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// transformContact
// ---------------------------------------------------------------------------

describe('Kore.ai transformContact', () => {
  it('maps id and email', () => {
    const out = transformContact({ id: 'c-1', emailId: 'alice@example.com' })
    expect(out.id).toBe('c-1')
    expect(out.email).toBe('alice@example.com')
    expect(out.platform).toBe('kore-ai')
  })

  it('falls back to _id when id is absent', () => {
    const out = transformContact({ _id: 'mongo-id' })
    expect(out.id).toBe('mongo-id')
  })

  it('uses fullName when present', () => {
    const out = transformContact({ id: 'c-2', fullName: 'John Smith' })
    expect(out.name).toBe('John Smith')
  })

  it('builds name from firstName + lastName', () => {
    const out = transformContact({ id: 'c-3', firstName: 'Jane', lastName: 'Doe' })
    expect(out.name).toBe('Jane Doe')
  })

  it('includes salutation in name build', () => {
    const out = transformContact({
      id: 'c-4',
      salutation: 'Dr.',
      firstName: 'Bob',
      lastName: 'Jones',
    })
    expect(out.name).toBe('Dr. Bob Jones')
  })

  it('maps phone from cellPhone', () => {
    const out = transformContact({
      id: 'c-5',
      cellPhone: { countryCode: '+1', phoneNumber: '5551234567' },
    })
    expect(out.phone).toBe('+15551234567')
  })

  it('maps orgId to organizationId', () => {
    const out = transformContact({ id: 'c-6', orgId: 'org-99' })
    expect(out.organizationId).toBe('org-99')
  })

  it('raw is preserved', () => {
    const raw = { id: 'c-7', emailId: 'test@example.com' }
    expect(transformContact(raw).raw).toBe(raw)
  })

  it('does not throw on empty input', () => {
    expect(() => transformContact({})).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// transformUser
// ---------------------------------------------------------------------------

describe('Kore.ai transformUser', () => {
  it('maps id and email', () => {
    const out = transformUser({ id: 'u-1', emailId: 'bob@example.com' })
    expect(out.id).toBe('u-1')
    expect(out.email).toBe('bob@example.com')
    expect(out.platform).toBe('kore-ai')
  })

  it('falls back to userId when id is absent', () => {
    const out = transformUser({ userId: 'uid-42' })
    expect(out.id).toBe('uid-42')
  })

  it('builds name from nickName + firstName + lastName', () => {
    const out = transformUser({
      id: 'u-2',
      nickName: 'Nicky',
      firstName: 'Nick',
      lastName: 'Smith',
    })
    expect(out.name).toBe('Nicky Nick Smith')
  })

  it('maps role field', () => {
    const out = transformUser({ id: 'u-3', role: 'supervisor' })
    expect(out.role).toBe('supervisor')
  })

  it('combines queues and agentGroups into teamIds (deduplicated)', () => {
    const out = transformUser({
      id: 'u-4',
      queues: [{ id: 'q-1' }, { id: 'q-2' }],
      agentGroups: [{ id: 'q-2' }, { id: 'g-1' }],
    })
    expect(out.teamIds).toEqual(['q-1', 'q-2', 'g-1'])
  })

  it('returns empty teamIds when neither queues nor agentGroups', () => {
    const out = transformUser({ id: 'u-5' })
    expect(out.teamIds).toEqual([])
  })

  it('does not throw on empty input', () => {
    expect(() => transformUser({})).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// transformTeam
// ---------------------------------------------------------------------------

describe('Kore.ai transformTeam', () => {
  it('maps id and name', () => {
    const out = transformTeam({ id: 'queue-1', name: 'Billing Queue' })
    expect(out.id).toBe('queue-1')
    expect(out.name).toBe('Billing Queue')
    expect(out.platform).toBe('kore-ai')
  })

  it('exposes description in metadata', () => {
    const out = transformTeam({ id: 'q2', name: 'Support', description: 'General support queue' })
    expect(out.metadata['description']).toBe('General support queue')
  })

  it('exposes isActive in metadata', () => {
    const out = transformTeam({ id: 'q3', name: 'Q3', isActive: true })
    expect(out.metadata['isActive']).toBe('true')
  })

  it('exposes hoursOfOperation name in metadata', () => {
    const out = transformTeam({
      id: 'q4',
      name: 'Q4',
      hoursOfOperation: { id: 'h1', name: '24/7' },
    })
    expect(out.metadata['hoursOfOperation']).toBe('24/7')
  })

  it('raw is preserved', () => {
    const raw = { id: 'q5', name: 'Raw Queue' }
    expect(transformTeam(raw).raw).toBe(raw)
  })

  it('refuses an empty queue instead of inventing an id', () => {
    expect(() => transformTeam({})).toThrow(/no `id`/)
  })
})

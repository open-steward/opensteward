import { describe, it, expect } from 'vitest'
import { transformTicket } from '../../../../../src/verticals/customer-support/adapters/helpspot/transform/ticket'
import { transformMessage } from '../../../../../src/verticals/customer-support/adapters/helpspot/transform/message'
import { transformContact } from '../../../../../src/verticals/customer-support/adapters/helpspot/transform/contact'
import { transformUser } from '../../../../../src/verticals/customer-support/adapters/helpspot/transform/user'
import { transformTeam } from '../../../../../src/verticals/customer-support/adapters/helpspot/transform/team'
import { transformMacro } from '../../../../../src/verticals/customer-support/adapters/helpspot/transform/macro'

// ---------------------------------------------------------------------------
// transformTicket
// ---------------------------------------------------------------------------

describe('HelpSpot transformTicket', () => {
  it('maps xRequest to id and externalId', () => {
    const out = transformTicket({ xRequest: 99, sTitle: 'Test ticket' })
    expect(out.id).toBe('99')
    expect(out.externalId).toBe('99')
    expect(out.number).toBe('99')
    expect(out.platform).toBe('helpspot')
  })

  it('maps fOpen=1 to status open', () => {
    const out = transformTicket({ xRequest: 1, fOpen: 1 })
    expect(out.status).toBe('open')
  })

  it('maps fOpen=0 to status closed', () => {
    const out = transformTicket({ xRequest: 2, fOpen: 0 })
    expect(out.status).toBe('closed')
  })

  it('maps fUrgent=1 to priority urgent', () => {
    const out = transformTicket({ xRequest: 3, fUrgent: 1 })
    expect(out.priority).toBe('urgent')
  })

  it('returns undefined priority when fUrgent=0', () => {
    const out = transformTicket({ xRequest: 4, fUrgent: 0 })
    expect(out.priority).toBeUndefined()
  })

  it('maps fOpenedVia=1 to channel email', () => {
    const out = transformTicket({ xRequest: 5, fOpenedVia: 1 })
    expect(out.channel).toBe('email')
  })

  it('maps fOpenedVia=7 to channel web', () => {
    const out = transformTicket({ xRequest: 6, fOpenedVia: 7 })
    expect(out.channel).toBe('web')
  })

  it('maps fOpenedVia=9 to channel chat', () => {
    const out = transformTicket({ xRequest: 7, fOpenedVia: 9 })
    expect(out.channel).toBe('chat')
  })

  it('maps fOpenedVia=2 to channel voice', () => {
    const out = transformTicket({ xRequest: 8, fOpenedVia: 2 })
    expect(out.channel).toBe('voice')
  })

  it('defaults channel to other for unknown fOpenedVia', () => {
    const out = transformTicket({ xRequest: 9, fOpenedVia: 99 })
    expect(out.channel).toBe('other')
  })

  it('maps requesterId from sUserId when present', () => {
    const out = transformTicket({ xRequest: 10, sUserId: 'uid-42', sEmail: 'user@example.com' })
    expect(out.requesterId).toBe('uid-42')
  })

  it('falls back requesterId to sEmail when sUserId is absent', () => {
    const out = transformTicket({ xRequest: 11, sEmail: 'user@example.com' })
    expect(out.requesterId).toBe('user@example.com')
  })

  it('maps assigneeId from xPersonAssignedTo', () => {
    const out = transformTicket({ xRequest: 12, xPersonAssignedTo: 7 })
    expect(out.assigneeId).toBe('7')
  })

  it('maps teamId from xCategory', () => {
    const out = transformTicket({ xRequest: 13, xCategory: 3 })
    expect(out.teamId).toBe('3')
  })

  it('maps tagIds from reportingTags csv', () => {
    const out = transformTicket({ xRequest: 14, reportingTags: 'billing,urgent,vip' })
    expect(out.tagIds).toEqual(['billing', 'urgent', 'vip'])
  })

  it('returns empty tagIds when reportingTags is absent', () => {
    const out = transformTicket({ xRequest: 15 })
    expect(Array.isArray(out.tagIds)).toBe(true)
    expect(out.tagIds).toHaveLength(0)
  })

  it('maps createdAt from dtGMTOpened unix timestamp', () => {
    const out = transformTicket({ xRequest: 16, dtGMTOpened: 1700000000 })
    expect(out.createdAt).toBe(new Date(1700000000 * 1000).toISOString())
  })

  it('maps closedAt from dtGMTClosed unix timestamp when non-zero', () => {
    const out = transformTicket({ xRequest: 17, fOpen: 0, dtGMTClosed: 1700100000 })
    expect(out.closedAt).toBe(new Date(1700100000 * 1000).toISOString())
  })

  it('does not set closedAt when dtGMTClosed is 0', () => {
    const out = transformTicket({ xRequest: 18, dtGMTClosed: 0 })
    expect(out.closedAt).toBeUndefined()
  })

  it('raw is preserved', () => {
    const raw = { xRequest: 19, sTitle: 'raw check' }
    const out = transformTicket(raw)
    expect(out.raw).toBe(raw)
  })

  it('does not throw on empty object', () => {
    expect(() => transformTicket({})).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// transformMessage — field correctness (dtGMTChange is authoritative; fPublic maps type)
// ---------------------------------------------------------------------------

describe('HelpSpot transformMessage', () => {
  it('synthesizes id from ticketId and index', () => {
    const out = transformMessage({}, 'tkt-5', 0)
    expect(out.id).toBe('tkt-5:0')
    expect(out.externalId).toBe('tkt-5:0')
    expect(out.ticketId).toBe('tkt-5')
  })

  it('maps fPublic=1 to type public', () => {
    const out = transformMessage({ fPublic: 1 }, 'tkt-1', 0)
    expect(out.type).toBe('public')
  })

  it('maps fPublic=0 to type internal', () => {
    const out = transformMessage({ fPublic: 0 }, 'tkt-1', 1)
    expect(out.type).toBe('internal')
  })

  it('defaults to internal when fPublic is absent', () => {
    const out = transformMessage({}, 'tkt-1', 2)
    expect(out.type).toBe('internal')
  })

  it('maps fPublic as string "1" to type public', () => {
    const out = transformMessage({ fPublic: '1' }, 'tkt-1', 3)
    expect(out.type).toBe('public')
  })

  it('uses dtGMTChange (not dtGMTDateAdded) for createdAt', () => {
    const out = transformMessage({ dtGMTChange: 1700000000 }, 'tkt-1', 4)
    expect(out.createdAt).toBe(new Date(1700000000 * 1000).toISOString())
  })

  it('falls back createdAt to epoch when dtGMTChange is absent', () => {
    const out = transformMessage({}, 'tkt-1', 5)
    expect(out.createdAt).toBe(new Date(0).toISOString())
  })

  it('maps xPerson > 0 to authorType user', () => {
    const out = transformMessage({ xPerson: 3 }, 'tkt-1', 6)
    expect(out.authorType).toBe('user')
    expect(out.authorId).toBe('3')
  })

  it('maps xPerson=0 to authorType contact', () => {
    const out = transformMessage({ xPerson: 0 }, 'tkt-1', 7)
    expect(out.authorType).toBe('contact')
  })

  it('maps absent xPerson to authorType contact', () => {
    const out = transformMessage({}, 'tkt-1', 8)
    expect(out.authorType).toBe('contact')
    expect(out.authorId).toBe('')
  })

  it('maps tNote to body', () => {
    const out = transformMessage({ tNote: 'Hello customer' }, 'tkt-1', 9)
    expect(out.body).toBe('Hello customer')
  })

  it('maps attachment_ct to attachmentCount', () => {
    const out = transformMessage({ attachment_ct: 3 }, 'tkt-1', 10)
    expect(out.attachmentCount).toBe(3)
  })

  it('platform is always helpspot', () => {
    const out = transformMessage({}, 'tkt-1', 11)
    expect(out.platform).toBe('helpspot')
  })

  it('raw is preserved', () => {
    const raw = { fPublic: 1, tNote: 'test' }
    const out = transformMessage(raw, 'tkt-1', 12)
    expect(out.raw).toBe(raw)
  })

  it('does not throw on minimal input', () => {
    expect(() => transformMessage({}, 'tkt-0', 0)).not.toThrow()
  })

  it('does not reference dtGMTDateAdded — uses dtGMTChange instead', () => {
    // dtGMTDateAdded should be ignored; dtGMTChange is authoritative
    const out = transformMessage(
      { dtGMTChange: 1700000100 } as Record<string, unknown>,
      'tkt-1',
      13,
    )
    expect(out.createdAt).toBe(new Date(1700000100 * 1000).toISOString())
  })
})

// ---------------------------------------------------------------------------
// transformContact
// ---------------------------------------------------------------------------

describe('HelpSpot transformContact', () => {
  it('maps xContact to id', () => {
    const out = transformContact({ xContact: 42, sEmail: 'a@b.com' })
    expect(out.id).toBe('42')
    expect(out.platform).toBe('helpspot')
  })

  it('falls back id to sEmail when xContact is absent', () => {
    const out = transformContact({ sEmail: 'a@b.com' })
    expect(out.id).toBe('a@b.com')
  })

  it('combines first + last name', () => {
    const out = transformContact({ xContact: 1, sFirstName: 'Jane', sLastName: 'Doe' })
    expect(out.name).toBe('Jane Doe')
  })

  it('maps email from sEmail', () => {
    const out = transformContact({ xContact: 2, sEmail: 'jane@example.com' })
    expect(out.email).toBe('jane@example.com')
  })

  it('maps phone from sPhone', () => {
    const out = transformContact({ xContact: 3, sPhone: '+1-555-0100' })
    expect(out.phone).toBe('+1-555-0100')
  })

  it('maps externalId from sUserId when present', () => {
    const out = transformContact({ xContact: 4, sUserId: 'ext-99' })
    expect(out.externalId).toBe('ext-99')
  })

  it('does not throw on minimal input', () => {
    expect(() => transformContact({})).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// transformUser
// ---------------------------------------------------------------------------

describe('HelpSpot transformUser', () => {
  it('maps xPerson to id', () => {
    const out = transformUser({ xPerson: 10, sFname: 'Alice', sLname: 'Agent' })
    expect(out.id).toBe('10')
    expect(out.platform).toBe('helpspot')
  })

  it('combines sFname + sLname as name', () => {
    const out = transformUser({ xPerson: 11, sFname: 'Bob', sLname: 'Smith' })
    expect(out.name).toBe('Bob Smith')
  })

  it('maps fUserType=1 to role admin', () => {
    const out = transformUser({ xPerson: 12, fUserType: 1 })
    expect(out.role).toBe('admin')
  })

  it('maps fUserType=2 to role agent', () => {
    const out = transformUser({ xPerson: 13, fUserType: 2 })
    expect(out.role).toBe('agent')
  })

  it('maps fUserType=4 to role guest', () => {
    const out = transformUser({ xPerson: 14, fUserType: 4 })
    expect(out.role).toBe('guest')
  })

  it('maps xGroup to teamIds', () => {
    const out = transformUser({ xPerson: 15, xGroup: 5 })
    expect(out.teamIds).toEqual(['5'])
  })

  it('returns empty teamIds when xGroup is absent', () => {
    const out = transformUser({ xPerson: 16 })
    expect(out.teamIds).toEqual([])
  })

  it('maps sEmail', () => {
    const out = transformUser({ xPerson: 17, sEmail: 'agent@example.com' })
    expect(out.email).toBe('agent@example.com')
  })

  it('does not throw on minimal input', () => {
    expect(() => transformUser({})).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// transformTeam
// ---------------------------------------------------------------------------

describe('HelpSpot transformTeam', () => {
  it('maps xCategory to id', () => {
    const out = transformTeam({ xCategory: 3, sCategory: 'Billing' })
    expect(out.id).toBe('3')
    expect(out.name).toBe('Billing')
    expect(out.platform).toBe('helpspot')
  })

  it('returns empty string name when sCategory is absent', () => {
    const out = transformTeam({ xCategory: 4 })
    expect(out.name).toBe('')
  })

  it('preserves fDeleted in metadata', () => {
    const out = transformTeam({ xCategory: 5, sCategory: 'Old', fDeleted: 1 })
    expect(out.metadata['fDeleted']).toBe('1')
  })

  it('does not throw on minimal input', () => {
    expect(() => transformTeam({})).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// transformMacro — name comes from sResponseTitle
// ---------------------------------------------------------------------------

describe('HelpSpot transformMacro', () => {
  it('maps xResponse to id', () => {
    const out = transformMacro({ xResponse: 7, sResponseTitle: 'Welcome Reply' })
    expect(out.id).toBe('7')
    expect(out.externalId).toBe('7')
    expect(out.platform).toBe('helpspot')
  })

  it('maps sResponseTitle (not sName) to title', () => {
    const out = transformMacro({ xResponse: 8, sResponseTitle: 'Auto Reply' })
    expect(out.title).toBe('Auto Reply')
  })

  it('returns empty string title when sResponseTitle is absent', () => {
    const out = transformMacro({ xResponse: 9 })
    expect(out.title).toBe('')
  })

  it('maps tResponse to body', () => {
    const out = transformMacro({ xResponse: 10, sResponseTitle: 'Hello', tResponse: 'Hello, how can I help?' })
    expect(out.body).toBe('Hello, how can I help?')
  })

  it('maps xCategory to category string', () => {
    const out = transformMacro({ xResponse: 11, xCategory: 2 })
    expect(out.category).toBe('2')
  })

  it('leaves category undefined when xCategory is absent', () => {
    const out = transformMacro({ xResponse: 12 })
    expect(out.category).toBeUndefined()
  })

  it('raw is preserved', () => {
    const raw = { xResponse: 13, sResponseTitle: 'Raw macro' }
    const out = transformMacro(raw)
    expect(out.raw).toBe(raw)
  })

  it('does not throw on minimal input', () => {
    expect(() => transformMacro({})).not.toThrow()
  })
})

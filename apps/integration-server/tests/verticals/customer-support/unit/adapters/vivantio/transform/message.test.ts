import { describe, it, expect } from 'vitest'
import {
  transformMessage,
  type RawVivantioAction,
} from '../../../../../../../src/verticals/customer-support/adapters/vivantio/transform/message'
import { MessageSchema } from '../../../../../../../src/verticals/customer-support/schema/message'

describe('vivantio transformMessage', () => {
  it('maps a public agent action with ActionUserEmail', () => {
    const raw: RawVivantioAction = {
      Id: 1001,
      ParentId: 2002,
      ActionUserName: 'agent1',
      ActionUserEmail: 'agent@example.com',
      ActionDate: '2024-01-15T09:30:00.000Z',
      Notes: 'Looking into the issue now.',
      IsPrivate: false,
      ActionType: 0,
      IsCustomerAction: false,
      IsSystemAction: false,
    }

    const result = transformMessage(raw, 'tkt-2002')

    // id maps from Id
    expect(result.id).toBe('1001')
    // ticketId passed through
    expect(result.ticketId).toBe('tkt-2002')
    // authorId prefers ActionUserEmail
    expect(result.authorId).toBe('agent@example.com')
    // authorType: not customer/system → 'user'
    expect(result.authorType).toBe('user')
    // body maps from Notes
    expect(result.body).toBe('Looking into the issue now.')
    // IsPrivate=false → 'public'
    expect(result.type).toBe('public')
    // platform
    expect(result.platform).toBe('vivantio')

    expect(() => MessageSchema.parse(result)).not.toThrow()
  })

  it('maps a private action — type=internal when IsPrivate=true', () => {
    const raw: RawVivantioAction = {
      Id: 2002,
      ActionUserName: 'agent2',
      ActionDate: '2024-01-16T11:00:00.000Z',
      Notes: 'Internal escalation note.',
      IsPrivate: true,
      IsCustomerAction: false,
      IsSystemAction: false,
    }

    const result = transformMessage(raw, 'tkt-1000')

    expect(result.type).toBe('internal')
    expect(result.authorType).toBe('user')

    expect(() => MessageSchema.parse(result)).not.toThrow()
  })

  it('maps an internal comment action via InternalComment field', () => {
    const raw: RawVivantioAction = {
      Id: 3003,
      ActionDate: '2024-01-17T08:00:00.000Z',
      InternalComment: 'Do not share with customer.',
      IsPrivate: false,
    }

    const result = transformMessage(raw, 'tkt-50')

    // InternalComment triggers internal type even when IsPrivate=false
    expect(result.type).toBe('internal')
    // body falls back to InternalComment when Notes absent
    expect(result.body).toBe('Do not share with customer.')

    expect(() => MessageSchema.parse(result)).not.toThrow()
  })

  it('maps a customer action — authorType=contact', () => {
    const raw: RawVivantioAction = {
      Id: 4004,
      ActionUserEmail: 'customer@example.com',
      ActionDate: '2024-01-18T10:00:00.000Z',
      Notes: 'Still happening after reboot.',
      IsCustomerAction: true,
      IsSystemAction: false,
    }

    const result = transformMessage(raw, 'tkt-100')

    expect(result.authorType).toBe('contact')
    expect(result.type).toBe('public')

    expect(() => MessageSchema.parse(result)).not.toThrow()
  })

  it('maps a system action — authorType=system', () => {
    const raw: RawVivantioAction = {
      Id: 5005,
      ActionDate: '2024-01-19T06:00:00.000Z',
      Notes: 'Auto-assigned by SLA rule.',
      IsSystemAction: true,
      IsCustomerAction: false,
    }

    const result = transformMessage(raw, 'tkt-200')

    expect(result.authorType).toBe('system')

    expect(() => MessageSchema.parse(result)).not.toThrow()
  })

  it('falls back to epoch when ActionDate absent', () => {
    const raw: RawVivantioAction = {
      Id: 6006,
      Notes: 'No date',
    }

    const result = transformMessage(raw, 'tkt-1')

    expect(result.createdAt).toBe(new Date(0).toISOString())

    expect(() => MessageSchema.parse(result)).not.toThrow()
  })

  it('falls back to ActionUserName when ActionUserEmail absent', () => {
    const raw: RawVivantioAction = {
      Id: 7007,
      ActionUserName: 'techteam',
      ActionDate: '2024-01-20T00:00:00.000Z',
      Notes: 'Name only',
    }

    const result = transformMessage(raw, 'tkt-2')

    expect(result.authorId).toBe('techteam')

    expect(() => MessageSchema.parse(result)).not.toThrow()
  })
})

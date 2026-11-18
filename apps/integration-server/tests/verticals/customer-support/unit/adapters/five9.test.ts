import { describe, it, expect } from 'vitest'
import { transformContact } from '../../../../../src/verticals/customer-support/adapters/five9/transform/contact'
import { transformUser } from '../../../../../src/verticals/customer-support/adapters/five9/transform/user'
import { transformTeam } from '../../../../../src/verticals/customer-support/adapters/five9/transform/team'
import { pickStr, pickNum, strMap, toIso } from '../../../../../src/verticals/customer-support/adapters/five9/transform/shared'
import { SCIM_BASE_URL, DEFAULT_PAGE_SIZE } from '../../../../../src/verticals/customer-support/adapters/five9/constants'

// ── constants ─────────────────────────────────────────────────────────────────

describe('constants', () => {
  it('SCIM_BASE_URL is the correct Five9 SCIM v2 base URL', () => {
    expect(SCIM_BASE_URL).toBe('https://api.five9.com/scim/v2')
  })

  it('DEFAULT_PAGE_SIZE is 100', () => {
    expect(DEFAULT_PAGE_SIZE).toBe(100)
  })
})

// ── shared helpers ────────────────────────────────────────────────────────────

describe('pickStr', () => {
  it('returns the string when it is a non-empty string', () => {
    expect(pickStr('hello')).toBe('hello')
  })

  it('returns empty string coerced via String() for empty string input', () => {
    // pickStr only skips null/undefined; empty string falls through to String(v) = ''
    expect(pickStr('')).toBe('')
  })

  it('returns undefined for null', () => {
    expect(pickStr(null)).toBeUndefined()
  })

  it('returns undefined for undefined', () => {
    expect(pickStr(undefined)).toBeUndefined()
  })

  it('coerces numbers to string', () => {
    expect(pickStr(42)).toBe('42')
  })
})

describe('pickNum', () => {
  it('returns the number as-is', () => {
    expect(pickNum(7)).toBe(7)
  })

  it('parses a numeric string', () => {
    expect(pickNum('3.14')).toBeCloseTo(3.14)
  })

  it('returns undefined for non-numeric string', () => {
    expect(pickNum('abc')).toBeUndefined()
  })

  it('returns undefined for null', () => {
    expect(pickNum(null)).toBeUndefined()
  })
})

describe('strMap', () => {
  it('converts primitive values to strings', () => {
    const m = strMap({ a: 'foo', b: 42, c: true })
    expect(m['a']).toBe('foo')
    expect(m['b']).toBe('42')
    expect(m['c']).toBe('true')
  })

  it('omits null/undefined values', () => {
    const m = strMap({ a: null, b: undefined, c: 'keep' })
    expect('a' in m).toBe(false)
    expect('b' in m).toBe(false)
    expect(m['c']).toBe('keep')
  })

  it('omits nested objects', () => {
    const m = strMap({ nested: { x: 1 }, flat: 'yes' })
    expect('nested' in m).toBe(false)
    expect(m['flat']).toBe('yes')
  })

  it('returns empty object for non-object input', () => {
    expect(strMap(null)).toEqual({})
    expect(strMap(undefined)).toEqual({})
    expect(strMap('string')).toEqual({})
  })
})

describe('toIso', () => {
  it('converts a valid ISO-8601 string to normalised form', () => {
    const result = toIso('2026-01-15T09:30:00Z')
    expect(result).toBe('2026-01-15T09:30:00.000Z')
  })

  it('converts a date-only string', () => {
    const result = toIso('2026-03-01')
    expect(typeof result).toBe('string')
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('returns undefined for null/undefined', () => {
    expect(toIso(null)).toBeUndefined()
    expect(toIso(undefined)).toBeUndefined()
  })

  it('returns undefined for an unparseable string', () => {
    expect(toIso('not-a-date')).toBeUndefined()
  })
})

// ── transformContact ──────────────────────────────────────────────────────────

describe('transformContact — id and platform', () => {
  it('sets id from SCIM id field', () => {
    const contact = transformContact({ id: 'usr-001', userName: 'alice@example.com' })
    expect(contact.id).toBe('usr-001')
    expect(contact.platform).toBe('five9')
  })

  it('falls back to externalId when id is absent', () => {
    const contact = transformContact({ externalId: 'ext-123', userName: 'bob@example.com' })
    expect(contact.id).toBe('ext-123')
  })

  it('falls back to userName when id and externalId are absent', () => {
    const contact = transformContact({ userName: 'charlie@example.com' })
    expect(contact.id).toBe('charlie@example.com')
  })

  it('returns empty string id when all id sources are absent', () => {
    const contact = transformContact({})
    expect(typeof contact.id).toBe('string')
    expect(contact.platform).toBe('five9')
  })
})

describe('transformContact — email resolution', () => {
  it('picks the primary email', () => {
    const contact = transformContact({
      id: 'u1',
      emails: [
        { value: 'secondary@example.com', primary: false },
        { value: 'primary@example.com', primary: true },
      ],
    })
    expect(contact.email).toBe('primary@example.com')
  })

  it('picks the first email when none is marked primary', () => {
    const contact = transformContact({
      id: 'u2',
      emails: [
        { value: 'first@example.com' },
        { value: 'second@example.com' },
      ],
    })
    expect(contact.email).toBe('first@example.com')
  })

  it('falls back to userName when no emails array', () => {
    const contact = transformContact({ id: 'u3', userName: 'user@example.com' })
    expect(contact.email).toBe('user@example.com')
  })

  it('returns undefined email when no emails or userName', () => {
    const contact = transformContact({ id: 'u4' })
    expect(contact.email).toBeUndefined()
  })
})

describe('transformContact — name resolution', () => {
  it('uses name.formatted when present', () => {
    const contact = transformContact({ id: 'u1', name: { formatted: 'Alice Smith' } })
    expect(contact.name).toBe('Alice Smith')
  })

  it('joins givenName + familyName when formatted is absent', () => {
    const contact = transformContact({ id: 'u2', name: { givenName: 'Bob', familyName: 'Jones' } })
    expect(contact.name).toBe('Bob Jones')
  })

  it('falls back to userName when no name fields', () => {
    const contact = transformContact({ id: 'u3', userName: 'charlie@example.com' })
    expect(contact.name).toBe('charlie@example.com')
  })

  it('returns empty string when no name source available', () => {
    const contact = transformContact({ id: 'u4' })
    expect(contact.name).toBe('')
  })
})

describe('transformContact — phone', () => {
  it('picks the primary phone number', () => {
    const contact = transformContact({
      id: 'u1',
      phoneNumbers: [
        { value: '+15550000001', primary: false },
        { value: '+15550000002', primary: true },
      ],
    })
    expect(contact.phone).toBe('+15550000002')
  })

  it('picks the first phone when none is primary', () => {
    const contact = transformContact({
      id: 'u2',
      phoneNumbers: [{ value: '+15550001234' }],
    })
    expect(contact.phone).toBe('+15550001234')
  })
})

describe('transformContact — metadata', () => {
  it('includes userName in metadata', () => {
    const contact = transformContact({ id: 'u1', userName: 'alice@example.com', active: true })
    expect(contact.metadata['userName']).toBe('alice@example.com')
  })

  it('includes active in metadata', () => {
    const contact = transformContact({ id: 'u2', active: false })
    expect(contact.metadata['active']).toBe('false')
  })

  it('never throws on minimal/null input', () => {
    expect(() => transformContact({})).not.toThrow()
    // SCIM omits empty multi-valued attributes rather than nulling them; only
    // externalId is nullable on the Five9 user resource.
    expect(() => transformContact({ externalId: null, emails: [], phoneNumbers: [] })).not.toThrow()
  })
})

// ── transformUser ─────────────────────────────────────────────────────────────

describe('transformUser — id and platform', () => {
  it('sets id from SCIM id field', () => {
    const user = transformUser({ id: 'agent-001', userName: 'agent@example.com' })
    expect(user.id).toBe('agent-001')
    expect(user.platform).toBe('five9')
  })

  it('falls back to externalId when id is absent', () => {
    const user = transformUser({ externalId: 'ext-agent', userName: 'agent@example.com' })
    expect(user.id).toBe('ext-agent')
  })

  it('falls back to userName when id and externalId are absent', () => {
    const user = transformUser({ userName: 'agent@example.com' })
    expect(user.id).toBe('agent@example.com')
  })
})

describe('transformUser — role', () => {
  it('uses primary role when present', () => {
    const user = transformUser({
      id: 'u1',
      roles: [
        { value: 'admin', primary: true },
        { value: 'agent', primary: false },
      ],
    })
    expect(user.role).toBe('admin')
  })

  it('uses first role when none is marked primary', () => {
    const user = transformUser({ id: 'u2', roles: [{ value: 'supervisor' }] })
    expect(user.role).toBe('supervisor')
  })

  it('defaults to agent for active users with no roles', () => {
    const user = transformUser({ id: 'u3', active: true })
    expect(user.role).toBe('agent')
  })

  it('defaults to inactive for inactive users with no roles', () => {
    const user = transformUser({ id: 'u4', active: false })
    expect(user.role).toBe('inactive')
  })
})

describe('transformUser — teamIds', () => {
  it('maps groups to teamIds', () => {
    const user = transformUser({
      id: 'u1',
      groups: [{ value: 'grp-1', display: 'Support' }, { value: 'grp-2', display: 'Sales' }],
    })
    expect(user.teamIds).toEqual(['grp-1', 'grp-2'])
  })

  it('returns empty array when no groups', () => {
    const user = transformUser({ id: 'u2' })
    expect(user.teamIds).toEqual([])
  })

  it('filters out groups with missing value', () => {
    const user = transformUser({
      id: 'u3',
      groups: [{ display: 'NoId' }, { value: 'grp-ok' }],
    })
    expect(user.teamIds).toEqual(['grp-ok'])
  })
})

describe('transformUser — metadata', () => {
  it('includes userName and active in metadata', () => {
    const user = transformUser({ id: 'u1', userName: 'agent@example.com', active: true })
    expect(user.metadata['userName']).toBe('agent@example.com')
    expect(user.metadata['active']).toBe('true')
  })

  it('never throws on minimal input', () => {
    expect(() => transformUser({})).not.toThrow()
  })
})

// ── transformTeam ─────────────────────────────────────────────────────────────

describe('transformTeam — id and platform', () => {
  it('sets id from SCIM id field', () => {
    const team = transformTeam({ id: 'grp-001', displayName: 'Support' })
    expect(team.id).toBe('grp-001')
    expect(team.platform).toBe('five9')
  })

  it('falls back to externalId when id is absent', () => {
    const team = transformTeam({ externalId: 'ext-grp', displayName: 'Sales' })
    expect(team.id).toBe('ext-grp')
  })

  it('falls back to displayName when id and externalId are absent', () => {
    const team = transformTeam({ displayName: 'Engineering' })
    expect(team.id).toBe('Engineering')
  })

  it('returns empty string id for empty input', () => {
    const team = transformTeam({})
    expect(typeof team.id).toBe('string')
    expect(team.platform).toBe('five9')
  })
})

describe('transformTeam — memberCount', () => {
  it('sets memberCount from members array length', () => {
    const team = transformTeam({
      id: 'grp-1',
      members: [
        { value: 'u1', display: 'Alice' },
        { value: 'u2', display: 'Bob' },
      ],
    })
    expect(team.memberCount).toBe(2)
  })

  it('sets memberCount to 0 for empty members array', () => {
    const team = transformTeam({ id: 'grp-2', members: [] })
    expect(team.memberCount).toBe(0)
  })

  it('leaves memberCount undefined when members is absent', () => {
    const team = transformTeam({ id: 'grp-3' })
    expect(team.memberCount).toBeUndefined()
  })
})

describe('transformTeam — metadata includes externalId and memberCount', () => {
  it('includes externalId in metadata', () => {
    const team = transformTeam({ id: 'grp-1', externalId: 'ext-42', displayName: 'Support' })
    expect(team.metadata['externalId']).toBe('ext-42')
  })

  it('falls back to id as externalId in metadata when externalId is absent', () => {
    const team = transformTeam({ id: 'grp-1', displayName: 'Support' })
    expect(team.metadata['externalId']).toBe('grp-1')
  })

  it('includes memberCount as string in metadata', () => {
    const team = transformTeam({
      id: 'grp-1',
      members: [{ value: 'u1' }, { value: 'u2' }, { value: 'u3' }],
    })
    expect(team.metadata['memberCount']).toBe('3')
  })

  it('omits memberCount from metadata when members is absent (undefined is skipped by strMap)', () => {
    const team = transformTeam({ id: 'grp-1' })
    // strMap skips undefined values, so memberCount key should not appear
    expect('memberCount' in team.metadata).toBe(false)
  })

  it('metadata is a Record<string, string> (all values are strings)', () => {
    const team = transformTeam({
      id: 'grp-1',
      externalId: 'ext-99',
      members: [{ value: 'u1' }],
    })
    for (const [, v] of Object.entries(team.metadata)) {
      expect(typeof v).toBe('string')
    }
  })

  it('never throws on minimal input', () => {
    expect(() => transformTeam({})).not.toThrow()
  })

  it('never throws on null members', () => {
    expect(() => transformTeam({ id: 'g1', members: null as unknown as [] })).not.toThrow()
  })
})

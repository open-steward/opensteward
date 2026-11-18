import { describe, it, expect } from 'vitest'
import { transformMessage } from '../../../../../src/verticals/customer-support/adapters/genesys-cloud/transform/message'
import { transformTicket } from '../../../../../src/verticals/customer-support/adapters/genesys-cloud/transform/ticket'
import { toIso } from '../../../../../src/verticals/customer-support/adapters/genesys-cloud/transform/shared'

// ── toIso helper ─────────────────────────────────────────────────────────────

describe('toIso', () => {
  it('converts a valid ISO-8601 string to a normalised ISO string', () => {
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

// ── transformMessage authorType mapping ──────────────────────────────────────

describe('transformMessage — authorType mapping', () => {
  const base = {
    id: 'msg1',
    body: 'hello',
    bodyType: 'standard',
    timestamp: '2026-01-15T09:30:00Z',
  }

  it("maps purpose='external' to authorType='contact'", () => {
    const msg = transformMessage({ ...base, sender: { id: 'u1', purpose: 'external' } }, 'tkt1')
    expect(msg.authorType).toBe('contact')
  })

  it("maps purpose='customer' to authorType='contact'", () => {
    const msg = transformMessage({ ...base, sender: { id: 'u1', purpose: 'customer' } }, 'tkt1')
    expect(msg.authorType).toBe('contact')
  })

  it("maps purpose='agent' to authorType='user'", () => {
    const msg = transformMessage({ ...base, sender: { id: 'u1', purpose: 'agent' } }, 'tkt1')
    expect(msg.authorType).toBe('user')
  })

  it("maps purpose='internal' to authorType='user'", () => {
    const msg = transformMessage({ ...base, sender: { id: 'u1', purpose: 'internal' } }, 'tkt1')
    expect(msg.authorType).toBe('user')
  })

  it("maps purpose='user' to authorType='user'", () => {
    const msg = transformMessage({ ...base, sender: { id: 'u1', purpose: 'user' } }, 'tkt1')
    expect(msg.authorType).toBe('user')
  })

  it("maps bodyType='notice' to authorType='system'", () => {
    const msg = transformMessage({ ...base, bodyType: 'notice', sender: { id: 'sys', purpose: '' } }, 'tkt1')
    expect(msg.authorType).toBe('system')
  })

  it("maps purpose='workflow' to authorType='system'", () => {
    const msg = transformMessage({ ...base, sender: { id: 'u1', purpose: 'workflow' } }, 'tkt1')
    expect(msg.authorType).toBe('system')
  })

  it("maps purpose='ivr' to authorType='system'", () => {
    const msg = transformMessage({ ...base, sender: { id: 'u1', purpose: 'ivr' } }, 'tkt1')
    expect(msg.authorType).toBe('system')
  })
})

// ── transformMessage datetime field ──────────────────────────────────────────

describe('transformMessage — datetime fields use toIso', () => {
  it('createdAt is a valid ISO-8601 string', () => {
    const msg = transformMessage(
      { id: 'm1', body: 'hi', bodyType: 'standard', timestamp: '2026-06-01T12:00:00Z' },
      'tkt1',
    )
    expect(msg.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  })

  it('falls back to epoch when timestamp is missing', () => {
    const msg = transformMessage({ id: 'm2', body: 'hi', bodyType: 'standard' }, 'tkt1')
    // Should not throw; createdAt must be a string
    expect(typeof msg.createdAt).toBe('string')
  })
})

// ── transformTicket status and id mapping ────────────────────────────────────

describe('transformTicket — status mapping', () => {
  it('maps an active conversation (no endTime) to open', () => {
    const tkt = transformTicket({
      id: 'conv-1',
      startTime: '2026-01-01T00:00:00Z',
      participants: [{ purpose: 'customer', state: 'connected', id: 'c1' }],
    })
    expect(tkt.status).toBe('open')
  })

  it('maps a held participant to on_hold', () => {
    const tkt = transformTicket({
      id: 'conv-2',
      startTime: '2026-01-01T00:00:00Z',
      participants: [{ purpose: 'customer', state: 'held', id: 'c1' }],
    })
    expect(tkt.status).toBe('on_hold')
  })

  it('maps an ended conversation with agent wrapup to resolved', () => {
    const tkt = transformTicket({
      id: 'conv-3',
      startTime: '2026-01-01T00:00:00Z',
      endTime: '2026-01-01T01:00:00Z',
      participants: [
        { purpose: 'customer', state: 'disconnected', id: 'c1' },
        { purpose: 'agent', state: 'disconnected', id: 'a1', wrapup: { code: 'resolved', name: 'Resolved' } },
      ],
    })
    expect(tkt.status).toBe('resolved')
  })

  it('maps an ended conversation without wrapup to closed', () => {
    const tkt = transformTicket({
      id: 'conv-4',
      startTime: '2026-01-01T00:00:00Z',
      endTime: '2026-01-01T01:00:00Z',
      participants: [
        { purpose: 'customer', state: 'disconnected', id: 'c1' },
      ],
    })
    expect(tkt.status).toBe('closed')
  })
})

describe('transformTicket — id fields', () => {
  it('sets id, externalId, and number from conversation id', () => {
    const tkt = transformTicket({
      id: 'abc-123',
      startTime: '2026-01-01T00:00:00Z',
      participants: [],
    })
    expect(tkt.id).toBe('abc-123')
    expect(tkt.externalId).toBe('abc-123')
    expect(tkt.number).toBe('abc-123')
  })

  it('does not throw when id is missing (returns empty string id)', () => {
    const tkt = transformTicket({ startTime: '2026-01-01T00:00:00Z', participants: [] })
    expect(typeof tkt.id).toBe('string')
    expect(tkt.platform).toBe('genesys-cloud')
  })
})

describe('transformTicket — datetime fields use toIso', () => {
  it('createdAt is a valid ISO-8601 string from startTime', () => {
    const tkt = transformTicket({
      id: 'conv-dt',
      startTime: '2026-03-15T08:00:00Z',
      participants: [],
    })
    expect(tkt.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  })

  it('resolvedAt is set when status is resolved', () => {
    const tkt = transformTicket({
      id: 'conv-res',
      startTime: '2026-01-01T00:00:00Z',
      endTime: '2026-01-01T01:00:00Z',
      participants: [
        { purpose: 'agent', state: 'disconnected', id: 'a1', wrapup: { code: 'done', name: 'Done' } },
      ],
    })
    expect(tkt.status).toBe('resolved')
    expect(tkt.resolvedAt).toBeDefined()
    expect(tkt.resolvedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('resolvedAt is set when status is closed', () => {
    const tkt = transformTicket({
      id: 'conv-cl',
      startTime: '2026-01-01T00:00:00Z',
      endTime: '2026-01-02T00:00:00Z',
      participants: [],
    })
    expect(tkt.status).toBe('closed')
    expect(tkt.resolvedAt).toBeDefined()
  })

  it('falls back to epoch ISO when startTime is missing', () => {
    const tkt = transformTicket({ id: 'conv-no-ts', participants: [] })
    expect(typeof tkt.createdAt).toBe('string')
  })
})

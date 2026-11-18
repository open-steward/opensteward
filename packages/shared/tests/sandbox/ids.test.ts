import { describe, it, expect } from 'vitest'
import {
  sandboxConnectionId,
  sandboxConnectionIds,
  isSandboxConnectionId,
} from '../../src/sandbox/ids'
import { isValidUuid } from '../../src/util/uuid'

describe('sandbox connection ids', () => {
  it('produces a valid UUID the vertical routes will accept', () => {
    // The routes call isValidUuid before the sandbox check ever runs, so a
    // malformed derivation would 400 rather than reaching the whitelist.
    expect(isValidUuid(sandboxConnectionId('acme', 'accounting'))).toBe(true)
  })

  it('is a v5 UUID with the RFC 4122 variant', () => {
    const id = sandboxConnectionId('acme', 'accounting')
    expect(id[14]).toBe('5')
    expect('89ab').toContain(id[19])
  })

  it('is lowercase', () => {
    const id = sandboxConnectionId('ACME', 'accounting')
    expect(id).toBe(id.toLowerCase())
  })

  it('is stable across calls', () => {
    expect(sandboxConnectionId('acme', 'accounting')).toBe(
      sandboxConnectionId('acme', 'accounting'),
    )
  })

  it('differs per tenant and per vertical', () => {
    const a = sandboxConnectionId('acme', 'accounting')
    expect(a).not.toBe(sandboxConnectionId('globex', 'accounting'))
    expect(a).not.toBe(sandboxConnectionId('acme', 'crm'))
  })

  it('does not collide when tenant and vertical concatenate the same', () => {
    // The name is `${tenant}:${vertical}`; a tenant literally named
    // `acme:accounting` with an empty vertical must not land on the same id.
    expect(sandboxConnectionId('acme:accounting', '')).not.toBe(
      sandboxConnectionId('acme', 'accounting'),
    )
  })

  it('accepts only the caller tenant’s own id for that vertical', () => {
    const mine = sandboxConnectionId('acme', 'accounting')
    expect(isSandboxConnectionId(mine, 'acme', 'accounting')).toBe(true)
    expect(
      isSandboxConnectionId(sandboxConnectionId('globex', 'accounting'), 'acme', 'accounting'),
    ).toBe(false)
    expect(isSandboxConnectionId(sandboxConnectionId('acme', 'crm'), 'acme', 'accounting')).toBe(
      false,
    )
  })

  it('rejects an arbitrary live-looking connection UUID', () => {
    expect(
      isSandboxConnectionId('11111111-2222-4333-8444-555555555555', 'acme', 'accounting'),
    ).toBe(false)
  })

  it('matches case-insensitively, since UUID_RE accepts either case', () => {
    const mine = sandboxConnectionId('acme', 'accounting')
    expect(isSandboxConnectionId(mine.toUpperCase(), 'acme', 'accounting')).toBe(true)
  })

  it('lists one id per vertical', () => {
    const rows = sandboxConnectionIds('acme', ['accounting', 'crm'])
    expect(rows.map((r) => r.vertical)).toEqual(['accounting', 'crm'])
    expect(rows[0]!.connectionId).toBe(sandboxConnectionId('acme', 'accounting'))
    expect(new Set(rows.map((r) => r.connectionId)).size).toBe(2)
  })
})

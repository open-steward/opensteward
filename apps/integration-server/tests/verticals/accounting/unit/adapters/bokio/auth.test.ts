import { describe, it, expect } from 'vitest'
import { BokioAdapter } from '../../../../../../src/verticals/accounting/adapters/bokio'
import { BOKIO_DEFAULT_SCOPES } from '../../../../../../src/verticals/accounting/adapters/bokio/constants'

const base = {
  clientId: 'client-1',
  clientSecret: 'secret-1',
  redirectUri: 'https://localhost/auth/accounting/bokio/callback',
}

function scopeOf(url: string): string | null {
  return new URL(url).searchParams.get('scope')
}

describe('BokioAdapter.getAuthUrl scope', () => {
  // Bokio's /authorize answers 400 invalid_scope "Missing scope parameter"
  // to an empty scope, so the adapter must never send one.
  it('falls back to the read scopes when the config selects none', () => {
    for (const scopes of [undefined, []]) {
      const url = new BokioAdapter({ ...base, scopes }).getAuthUrl('state-1')
      expect(scopeOf(url)).toBe(BOKIO_DEFAULT_SCOPES.join(' '))
    }
  })

  it('sends the configured scopes when there are some', () => {
    const url = new BokioAdapter({
      ...base,
      scopes: ['invoices:read', 'invoices:write'],
    }).getAuthUrl('state-1')
    expect(scopeOf(url)).toBe('invoices:read invoices:write')
  })

  it('lets a Connect Link override win, and ignores an empty one', () => {
    const adapter = new BokioAdapter({ ...base, scopes: ['invoices:write'] })
    expect(scopeOf(adapter.getAuthUrl('s', ['customers:read']))).toBe('customers:read')
    expect(scopeOf(adapter.getAuthUrl('s', []))).toBe('invoices:write')
  })

  it('defaults to read scopes only', () => {
    expect(BOKIO_DEFAULT_SCOPES.every((s) => s.endsWith(':read'))).toBe(true)
  })
})

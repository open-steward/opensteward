import { describe, it, expect } from 'vitest'
import { resolveOverrideScopesFor } from '../../src/control-plane/connect-router'

describe('resolveOverrideScopesFor', () => {
  const READ = ['accounting.transactions.read', 'accounting.contacts.read']
  const CUSTOM = ['accounting.transactions', 'accounting.settings']

  it("read_only returns the platform's curated read scopes", () => {
    expect(resolveOverrideScopesFor('read_only', null, READ)).toEqual(READ)
  })

  it('read_only falls back to platform default (undefined) when no read scopes catalogued', () => {
    expect(resolveOverrideScopesFor('read_only', null, undefined)).toBeUndefined()
    expect(resolveOverrideScopesFor('read_only', null, [])).toBeUndefined()
  })

  it('read_only ignores any stored custom scopes', () => {
    expect(resolveOverrideScopesFor('read_only', CUSTOM, READ)).toEqual(READ)
  })

  it('platform_default always means no override', () => {
    expect(resolveOverrideScopesFor('platform_default', CUSTOM, READ)).toBeUndefined()
  })

  it('custom returns the stored scope array', () => {
    expect(resolveOverrideScopesFor('custom', CUSTOM, READ)).toEqual(CUSTOM)
  })

  it('custom with no scopes falls back to platform default', () => {
    expect(resolveOverrideScopesFor('custom', null, READ)).toBeUndefined()
  })
})

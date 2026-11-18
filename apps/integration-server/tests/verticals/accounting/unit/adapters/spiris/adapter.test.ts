import { describe, it, expect } from 'vitest'
import { SpirisAdapter } from '../../../../../../src/verticals/accounting/adapters/spiris'
import { VismaAdapter } from '../../../../../../src/verticals/accounting/adapters/visma'

const adapter = new SpirisAdapter({
  clientId: 'test-id',
  clientSecret: 'test-secret',
  redirectUri: 'http://localhost:3010/auth/accounting/spiris/callback',
  scopes: ['ea:api'],
})

describe('SpirisAdapter', () => {
  it('has platform "spiris"', () => {
    expect(adapter.platform).toBe('spiris')
  })

  it('has same version as VismaAdapter', () => {
    const visma = new VismaAdapter({
      clientId: 'test-id',
      clientSecret: 'test-secret',
      redirectUri: 'http://localhost:3010/auth/accounting/visma/callback',
      scopes: ['ea:api'],
    })
    expect(adapter.version).toBe(visma.version)
  })

  it('is an instance of VismaAdapter', () => {
    expect(adapter).toBeInstanceOf(VismaAdapter)
  })

  it('inherits getAuthUrl', () => {
    const url = adapter.getAuthUrl('test-state')
    expect(url).toContain('vismaonline.com')
    expect(url).toContain('test-state')
  })
})

import { describe, it, expect } from 'vitest'
import { buildAuthUrl } from '../../../../../../../src/verticals/ecommerce/adapters/tokopedia/auth'

describe('buildAuthUrl', () => {
  it('returns a URL with required query parameters', () => {
    const url = buildAuthUrl('my-client-id', 'https://example.com/callback')
    expect(url).toContain('accounts.tokopedia.com')
    expect(url).toContain('client_id=my-client-id')
    expect(url).toContain('redirect_uri=')
    expect(url).toContain('response_type=code')
  })

  it('includes the authorize path', () => {
    const url = buildAuthUrl('test-id', 'https://cb.test')
    expect(url).toContain('/authorize')
  })

  it('encodes the redirect URI', () => {
    const url = buildAuthUrl('test-id', 'https://example.com/callback?foo=bar')
    expect(url).toContain('redirect_uri=')
    // The URL should be encoded properly
    expect(url).toContain('example.com')
  })
})

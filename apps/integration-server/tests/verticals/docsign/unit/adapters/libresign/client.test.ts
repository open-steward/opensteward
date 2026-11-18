import { describe, it, expect } from 'vitest'
import type { Credentials } from '@opensteward/shared'
import { LibreSignClient } from '../../../../../../src/verticals/docsign/adapters/libresign/client'

/**
 * LibreSign is self-hosted: the Nextcloud host and username come only from the
 * connection (auth.ts requires both). With either missing the client must
 * refuse, not send Basic credentials to an invented host.
 */
describe('LibreSignClient credentials', () => {
  it('throws when the connection has no serverUrl', () => {
    const creds = { accessToken: 'pw', extra: { username: 'u' } } as Credentials
    expect(() => new LibreSignClient(creds)).toThrow(/serverUrl/)
  })

  it('throws when the connection has no username', () => {
    const creds = { accessToken: 'pw', extra: { serverUrl: 'https://nc.test' } } as Credentials
    expect(() => new LibreSignClient(creds)).toThrow(/username/)
  })

  it('builds the OCS base URL from the connection serverUrl', () => {
    const creds = {
      accessToken: 'pw',
      extra: { serverUrl: 'https://nc.test/', username: 'u' },
    } as Credentials
    const client = new LibreSignClient(creds) as unknown as {
      http: { defaults: { baseURL?: string; headers: Record<string, unknown> } }
    }
    expect(client.http.defaults.baseURL).toBe('https://nc.test/ocs/v2.php/apps/libresign/api/v1')
    expect(client.http.defaults.headers['Authorization']).toBe(
      `Basic ${Buffer.from('u:pw').toString('base64')}`,
    )
  })
})

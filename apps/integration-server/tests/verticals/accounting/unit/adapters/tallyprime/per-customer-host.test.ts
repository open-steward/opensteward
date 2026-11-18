/**
 * TallyPrime's XML server runs on the customer's own machine, so the address
 * OpenSteward calls is per customer. It must be collected by the Connect Link
 * form, must be https, and must not be a private/LAN address (the deployment
 * can opt out with OST_ALLOW_PRIVATE_HOSTS=1) — never a localhost default.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import axios from 'axios'
import { setDnsResolver } from '@opensteward/shared'
import { TallyPrimeAdapter } from '../../../../../../src/verticals/accounting/adapters/tallyprime'

const PUBLIC_IP = '93.184.216.34'
const PRIVATE_IP = '192.168.1.50'

let savedAllow: string | undefined
beforeEach(() => {
  savedAllow = process.env['OST_ALLOW_PRIVATE_HOSTS']
  delete process.env['OST_ALLOW_PRIVATE_HOSTS']
  setDnsResolver(async (host) => ({
    address: host.endsWith('.internal.example') ? PRIVATE_IP : PUBLIC_IP,
  }))
})
afterEach(() => {
  setDnsResolver(undefined)
  if (savedAllow === undefined) delete process.env['OST_ALLOW_PRIVATE_HOSTS']
  else process.env['OST_ALLOW_PRIVATE_HOSTS'] = savedAllow
  vi.restoreAllMocks()
})

describe('TallyPrime Connect Link form', () => {
  const adapter = new TallyPrimeAdapter()

  it('declares the gateway URL the client reads', () => {
    const byName = Object.fromEntries(adapter.credentialFields().map((f) => [f.name, f]))
    expect(Object.keys(byName)).toEqual(['gatewayUrl'])
    expect(byName['gatewayUrl']).toMatchObject({ type: 'url', required: true })
    expect(byName['gatewayUrl']?.helpText).toMatch(/HTTPS/)
    expect(byName['gatewayUrl']?.helpText).toMatch(/OST_ALLOW_PRIVATE_HOSTS/)
  })

  it('rejects a blank gateway URL', async () => {
    await expect(adapter.exchangeCredentials({ gatewayUrl: '' })).rejects.toThrow(
      /gateway URL is required/,
    )
  })

  it('rejects the plain-http Tally port', async () => {
    await expect(
      adapter.exchangeCredentials({ gatewayUrl: 'http://tally.example.com:9000' }),
    ).rejects.toThrow(/must use https/)
  })

  it('rejects a LAN address', async () => {
    await expect(
      adapter.exchangeCredentials({ gatewayUrl: 'https://192.168.1.50:9000' }),
    ).rejects.toThrow(/private or reserved network address/)
    await expect(
      adapter.exchangeCredentials({ gatewayUrl: 'https://tally.internal.example' }),
    ).rejects.toThrow(/private or reserved network address/)
  })

  it('normalises the URL and stores it where the client reads it', async () => {
    const creds = await adapter.exchangeCredentials({ gatewayUrl: ' https://Tally.example.com/xml/ ' })
    expect(creds).toEqual({ accessToken: 'local', extra: { baseUrl: 'https://tally.example.com/xml' } })
  })
})

describe('TallyPrime client host comes from the connection', () => {
  it('posts to the gateway stored on the credentials', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: '<ENVELOPE></ENVELOPE>' })
    const adapter = new TallyPrimeAdapter()
    await adapter
      .getOrganization({ accessToken: 'local', extra: { baseUrl: 'https://tally.example.com/xml' } })
      .catch(() => undefined)
    expect(post).toHaveBeenCalledWith('https://tally.example.com/xml', expect.any(String), expect.anything())
  })

  it('refuses to call localhost when the connection has no gateway URL', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: '<ENVELOPE></ENVELOPE>' })
    const adapter = new TallyPrimeAdapter()
    await expect(adapter.getOrganization({ accessToken: 'local' })).rejects.toThrow(
      /missing its gateway URL/,
    )
    expect(post).not.toHaveBeenCalled()
  })
})

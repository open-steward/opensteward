import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  assertPublicHost,
  isPrivateIp,
  safeFetch,
  setDnsResolver,
  SsrfBlockedError,
} from '../../src/net/safe-fetch'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  setDnsResolver(undefined)
})

describe('isPrivateIp', () => {
  it('flags RFC 1918 ranges', () => {
    expect(isPrivateIp('10.0.0.1')).toBe(true)
    expect(isPrivateIp('10.255.255.255')).toBe(true)
    expect(isPrivateIp('172.16.0.1')).toBe(true)
    expect(isPrivateIp('172.31.255.255')).toBe(true)
    expect(isPrivateIp('192.168.0.1')).toBe(true)
  })

  it('flags loopback + link-local', () => {
    expect(isPrivateIp('127.0.0.1')).toBe(true)
    expect(isPrivateIp('169.254.169.254')).toBe(true) // AWS metadata
  })

  it('flags 0.0.0.0/8 and CGNAT', () => {
    expect(isPrivateIp('0.0.0.0')).toBe(true)
    expect(isPrivateIp('100.64.0.1')).toBe(true)
  })

  it('flags IPv6 private/loopback/link-local', () => {
    expect(isPrivateIp('::1')).toBe(true)
    expect(isPrivateIp('fc00::1')).toBe(true)
    expect(isPrivateIp('fd00::abcd')).toBe(true)
    expect(isPrivateIp('fe80::1')).toBe(true)
  })

  it('flags IPv4-mapped IPv6 of private v4', () => {
    expect(isPrivateIp('::ffff:127.0.0.1')).toBe(true)
    expect(isPrivateIp('::ffff:10.0.0.1')).toBe(true)
  })

  it('does not flag legitimate public IPs', () => {
    expect(isPrivateIp('1.1.1.1')).toBe(false)
    expect(isPrivateIp('8.8.8.8')).toBe(false)
    expect(isPrivateIp('172.32.0.1')).toBe(false) // just outside 172.16/12
    expect(isPrivateIp('2606:4700:4700::1111')).toBe(false)
  })

  it('returns false for non-IP strings', () => {
    expect(isPrivateIp('example.com')).toBe(false)
    expect(isPrivateIp('')).toBe(false)
  })
})

describe('assertPublicHost', () => {
  it('rejects an IP literal in a private range without DNS', async () => {
    await expect(assertPublicHost('127.0.0.1')).rejects.toBeInstanceOf(SsrfBlockedError)
    await expect(assertPublicHost('169.254.169.254')).rejects.toBeInstanceOf(SsrfBlockedError)
  })

  it('accepts a public IP literal', async () => {
    await expect(assertPublicHost('1.1.1.1')).resolves.toBeUndefined()
  })

  it('bypasses checks when OST_ALLOW_PRIVATE_HOSTS=1', async () => {
    vi.stubEnv('OST_ALLOW_PRIVATE_HOSTS', '1')
    await expect(assertPublicHost('127.0.0.1')).resolves.toBeUndefined()
    await expect(assertPublicHost('localhost')).resolves.toBeUndefined()
  })

  it('rejects a hostname whose first A record is private', async () => {
    setDnsResolver(async () => ({ address: '10.0.0.1' }))
    await expect(assertPublicHost('attacker.example')).rejects.toBeInstanceOf(SsrfBlockedError)
  })

  it('accepts a hostname whose A record is public', async () => {
    setDnsResolver(async () => ({ address: '93.184.216.34' }))
    await expect(assertPublicHost('example.com')).resolves.toBeUndefined()
  })

  it('rejects when ANY record is private, not only the first (round-robin)', async () => {
    // A name that answers with a mix of a public and a private address must be
    // refused — checking only the first record would let a private one through.
    setDnsResolver(async () => [{ address: '93.184.216.34' }, { address: '10.0.0.5' }])
    await expect(assertPublicHost('rebind.example')).rejects.toBeInstanceOf(SsrfBlockedError)
  })

  it('accepts when every record is public', async () => {
    setDnsResolver(async () => [{ address: '93.184.216.34' }, { address: '1.1.1.1' }])
    await expect(assertPublicHost('multi.example')).resolves.toBeUndefined()
  })

  it('fails closed when a name resolves to no address', async () => {
    setDnsResolver(async () => [])
    await expect(assertPublicHost('empty.example')).rejects.toBeInstanceOf(SsrfBlockedError)
  })
})

describe('safeFetch', () => {
  it('throws SsrfBlockedError when destination is private', async () => {
    await expect(safeFetch('http://127.0.0.1/test')).rejects.toBeInstanceOf(SsrfBlockedError)
  })

  it('rejects on a 3xx redirect to a private IP', async () => {
    setDnsResolver(async () => ({ address: '93.184.216.34' }))
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: 'http://169.254.169.254/' },
        }) as unknown as Response,
      )
    await expect(safeFetch('http://example.com/cb')).rejects.toBeInstanceOf(SsrfBlockedError)
    expect(fetchSpy).toHaveBeenCalledOnce()
  })

  it('follows public-to-public redirects up to max', async () => {
    setDnsResolver(async () => ({ address: '93.184.216.34' }))
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: 'https://example.com/final' },
        }) as unknown as Response,
      )
      .mockResolvedValueOnce(new Response('OK', { status: 200 }) as unknown as Response)
    const res = await safeFetch('https://example.com/start')
    expect(res.status).toBe(200)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })
})

/**
 * `TRUST_PROXY` parsing.
 *
 * Off is the secure default: with it unset, `request.ip` is the socket peer
 * and no client can spoof an IP-keyed rate limit by writing its own
 * X-Forwarded-For. Behind a TLS-terminating proxy an operator turns it on
 * with `true` or names the proxy CIDRs.
 *
 * The hop-count form used to be accepted too. Fastify 5.12.1 removed it
 * (GHSA-3m5p-2c4r-xxw2) and, crucially, fails CLOSED on a number at runtime
 * rather than erroring — so passing one through would silently turn a working
 * deployment into one that ignores the proxy. These cases pin that the parser
 * refuses it loudly at boot instead, for both the env var and config.yml.
 */
import { describe, it, expect } from 'vitest'
import { parseTrustProxy } from '../../src/config'

describe('parseTrustProxy', () => {
  it('is undefined when unset so the caller falls through to the secure default', () => {
    expect(parseTrustProxy(undefined)).toBeUndefined()
    expect(parseTrustProxy('')).toBeUndefined()
    expect(parseTrustProxy('   ')).toBeUndefined()
  })

  it('reads true / 1 as "trust the whole chain"', () => {
    expect(parseTrustProxy('true')).toBe(true)
    expect(parseTrustProxy('TRUE')).toBe(true)
    expect(parseTrustProxy('1')).toBe(true)
  })

  it('reads false / 0 as off', () => {
    expect(parseTrustProxy('false')).toBe(false)
    expect(parseTrustProxy('0')).toBe(false)
  })

  it('passes an IP / CIDR list through untouched for Fastify to compile', () => {
    expect(parseTrustProxy('10.0.0.0/8,172.16.0.0/12')).toBe('10.0.0.0/8,172.16.0.0/12')
    expect(parseTrustProxy('::1')).toBe('::1')
    expect(parseTrustProxy('loopback')).toBe('loopback')
  })

  it('refuses a hop count, naming the advisory and the replacement', () => {
    expect(() => parseTrustProxy('2')).toThrow(/hop count/)
    expect(() => parseTrustProxy('2')).toThrow(/GHSA-3m5p-2c4r-xxw2/)
    expect(() => parseTrustProxy('3')).toThrow(/CIDR/)
  })

  it('applies the same rules to a config.yml value, which YAML types natively', () => {
    // YAML `trustProxy: true` / `1` / `2` arrive as boolean / number, not string.
    expect(parseTrustProxy(true)).toBe(true)
    expect(parseTrustProxy(false)).toBe(false)
    expect(parseTrustProxy(1)).toBe(true)
    expect(parseTrustProxy(0)).toBe(false)
    expect(() => parseTrustProxy(2)).toThrow(/hop count/)
  })
})

/**
 * Cross-origin access to the developer API.
 *
 * docs-server ships a Swagger console at :3003/unified-api whose spec points
 * at integration-server on :3010, so "Try it out" is a cross-origin request.
 * The API sends no `Access-Control-*` headers — `createBaseServer` registers
 * @fastify/cors with `origin: false` and no app ever passed anything else — so
 * every request from that console is blocked by the browser before it arrives.
 *
 * Off remains the default: a public API that reflects arbitrary origins invites
 * a hostile page to spend a victim's credentials. `CORS_ORIGIN` opts a
 * deployment in by naming the origins allowed, and the shipped compose file
 * names the docs-server origin so the console works out of the box.
 */
import { describe, it, expect } from 'vitest'
import { parseCorsOrigin } from '../../src/config'

describe('parseCorsOrigin', () => {
  it('is disabled when unset — a public API does not answer arbitrary origins', () => {
    expect(parseCorsOrigin(undefined)).toBe(false)
    expect(parseCorsOrigin('')).toBe(false)
    expect(parseCorsOrigin('   ')).toBe(false)
  })

  it('accepts a single origin', () => {
    expect(parseCorsOrigin('http://localhost:3003')).toEqual(['http://localhost:3003'])
  })

  it('accepts a comma-separated list, trimming whitespace', () => {
    expect(parseCorsOrigin('http://localhost:3003, https://docs.acme.example')).toEqual([
      'http://localhost:3003',
      'https://docs.acme.example',
    ])
  })

  it('drops empty entries from a sloppy list rather than allowing ""', () => {
    expect(parseCorsOrigin('http://localhost:3003,,')).toEqual(['http://localhost:3003'])
  })

  it('strips a trailing slash so it matches the browser Origin header', () => {
    // Browsers send `Origin: http://localhost:3003` — never with a path or
    // trailing slash — and @fastify/cors compares the string exactly.
    expect(parseCorsOrigin('http://localhost:3003/')).toEqual(['http://localhost:3003'])
  })

  it('honours an explicit wildcard, since an operator may mean it', () => {
    expect(parseCorsOrigin('*')).toBe('*')
  })

  it("treats a '*' anywhere in the list as the wildcard it is", () => {
    // @fastify/cors collapses an array containing '*' to a bare '*', so
    // "these two origins, plus a literal asterisk" is not a thing an operator
    // can express. Surfacing that here keeps the widening visible.
    expect(parseCorsOrigin('http://localhost:3003,*')).toBe('*')
  })

  it('never reflects an arbitrary origin implicitly', () => {
    // `true` in @fastify/cors echoes whatever Origin arrives. Reaching that
    // must take the explicit '*' above, not a stray value.
    expect(parseCorsOrigin('true')).toEqual(['true'])
  })
})

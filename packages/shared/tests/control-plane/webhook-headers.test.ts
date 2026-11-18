import { describe, it, expect } from 'vitest'
import { validateHeaders, MAX_HEADERS, MAX_HEADER_BYTES } from '../../src/control-plane/webhook-headers'

/**
 * Custom headers are the one place in this codebase where tenant-supplied
 * text becomes part of an outbound HTTP request line. Everything else builds
 * headers from fixed literals. These tests pin the boundary.
 */
describe('validateHeaders', () => {
  it('accepts an ordinary credential header', () => {
    const result = validateHeaders({ Authorization: 'Bearer abc123' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toEqual({ Authorization: 'Bearer abc123' })
  })

  it('accepts an empty map', () => {
    const result = validateHeaders({})
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toEqual({})
  })

  describe('injection', () => {
    // Rejected, never stripped: silently mangling a credential produces a
    // header that looks right in the UI and fails at the receiver.
    it.each([
      ['carriage return', 'abc\rX-Injected: 1'],
      ['line feed', 'abc\nX-Injected: 1'],
      ['CRLF', 'abc\r\nX-Injected: 1'],
      ['NUL', 'abc\u0000'],
    ])('rejects %s in a value', (_label, value) => {
      const result = validateHeaders({ 'X-Api-Key': value })
      expect(result.ok).toBe(false)
    })

    it('rejects a newline in a name', () => {
      expect(validateHeaders({ 'X-Bad\nName': 'v' }).ok).toBe(false)
    })

    it('rejects a non-ASCII value', () => {
      expect(validateHeaders({ 'X-Api-Key': 'sé' }).ok).toBe(false)
    })
  })

  describe('denylist', () => {
    // x-oi-* is the one that matters most: without it a subscription could
    // overwrite the signature header the receiver verifies against.
    it.each([
      ['x-oi-signature'],
      ['X-OI-Signature'],
      ['x-oi-event'],
      ['host'],
      ['Content-Length'],
      ['content-type'],
      ['transfer-encoding'],
      ['connection'],
      ['keep-alive'],
      ['upgrade'],
      ['te'],
      ['trailer'],
      ['expect'],
      ['proxy-authorization'],
    ])('rejects %s', (name) => {
      const result = validateHeaders({ [name]: 'value' })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toMatch(/not allowed|reserved/i)
    })

    it('allows a header whose name merely contains a denied word', () => {
      expect(validateHeaders({ 'X-Host-Override': 'v' }).ok).toBe(true)
    })
  })

  describe('grammar', () => {
    it('accepts RFC 9110 token punctuation in a name', () => {
      expect(validateHeaders({ "X-Weird!#$%&'*+.^_`|~-Name": 'v' }).ok).toBe(true)
    })

    it.each([['X Bad'], ['X:Bad'], ['X(Bad)'], ['X@Bad'], ['']])(
      'rejects the invalid name %j',
      (name) => {
        expect(validateHeaders({ [name]: 'v' }).ok).toBe(false)
      },
    )

    it('accepts horizontal tab in a value', () => {
      expect(validateHeaders({ 'X-Api-Key': 'a\tb' }).ok).toBe(true)
    })
  })

  describe('caps', () => {
    it(`rejects more than ${MAX_HEADERS} headers`, () => {
      const many: Record<string, string> = {}
      for (let i = 0; i <= MAX_HEADERS; i++) many[`X-H${i}`] = 'v'
      const result = validateHeaders(many)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toMatch(/at most/i)
    })

    it(`accepts exactly ${MAX_HEADERS} headers`, () => {
      const many: Record<string, string> = {}
      for (let i = 0; i < MAX_HEADERS; i++) many[`X-H${i}`] = 'v'
      expect(validateHeaders(many).ok).toBe(true)
    })

    it('rejects an over-long name', () => {
      expect(validateHeaders({ [`X-${'a'.repeat(64)}`]: 'v' }).ok).toBe(false)
    })

    it('rejects an over-long value', () => {
      expect(validateHeaders({ 'X-Api-Key': 'a'.repeat(2049) }).ok).toBe(false)
    })

    it(`rejects a set over ${MAX_HEADER_BYTES} bytes in total`, () => {
      const heavy: Record<string, string> = {}
      for (let i = 0; i < 5; i++) heavy[`X-H${i}`] = 'a'.repeat(2000)
      const result = validateHeaders(heavy)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toMatch(/too large|at most/i)
    })
  })

  describe('duplicates', () => {
    it('rejects two names differing only in case', () => {
      const result = validateHeaders({ 'X-Api-Key': 'a', 'x-api-key': 'b' })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toMatch(/duplicate/i)
    })
  })
})

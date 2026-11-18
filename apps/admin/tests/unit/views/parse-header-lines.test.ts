import { describe, it, expect } from 'vitest'
import { parseHeaderLines } from '../../../src/core/views/parse-header-lines'

/**
 * The admin form takes headers as `Name: value` lines in a textarea. A parser
 * that silently mangles a credential produces a subscription that looks right
 * on the page and 401s at the receiver, so every malformed line is an error
 * the operator sees, never a quiet repair.
 */
describe('parseHeaderLines', () => {
  it('parses one header per line', () => {
    const result = parseHeaderLines('Authorization: Bearer abc\nX-Api-Key: k-1')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual({ Authorization: 'Bearer abc', 'X-Api-Key': 'k-1' })
    }
  })

  it('treats empty input as no headers', () => {
    for (const input of ['', '   ', '\n\n', undefined]) {
      const result = parseHeaderLines(input)
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value).toEqual({})
    }
  })

  it('ignores blank lines between headers', () => {
    const result = parseHeaderLines('A: 1\n\n\nB: 2\n')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toEqual({ A: '1', B: '2' })
  })

  it('keeps colons inside the value', () => {
    const result = parseHeaderLines('X-Trace: id:123:abc')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toEqual({ 'X-Trace': 'id:123:abc' })
  })

  it('trims one space after the colon but preserves inner spacing', () => {
    const result = parseHeaderLines('X-Note:   two  words  ')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toEqual({ 'X-Note': 'two  words' })
  })

  it('handles CRLF line endings from a browser textarea', () => {
    const result = parseHeaderLines('A: 1\r\nB: 2')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toEqual({ A: '1', B: '2' })
  })

  it('reports a line with no colon, naming the line number', () => {
    const result = parseHeaderLines('Authorization Bearer abc')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/line 1/i)
      expect(result.error).toMatch(/Name: value/i)
    }
  })

  it('reports an empty value rather than sending a blank header', () => {
    const result = parseHeaderLines('X-Api-Key:')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/line 1/i)
  })

  it('rejects a header the delivery layer would refuse', () => {
    // Same rule as the API — the operator finds out here, not after saving.
    const result = parseHeaderLines('x-oi-signature: sha256=forged')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/reserved|not allowed/i)
  })

  it('rejects a duplicate name differing only in case', () => {
    const result = parseHeaderLines('X-Api-Key: a\nx-api-key: b')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/duplicate/i)
  })

  describe('formatHeaderLines', () => {
    it('round-trips through the parser', async () => {
      const { formatHeaderLines } = await import('../../../src/core/views/parse-header-lines')
      const headers = { Authorization: 'Bearer abc', 'X-Api-Key': 'k-1' }
      const parsed = parseHeaderLines(formatHeaderLines(headers))
      expect(parsed.ok).toBe(true)
      if (parsed.ok) expect(parsed.value).toEqual(headers)
    })
  })
})

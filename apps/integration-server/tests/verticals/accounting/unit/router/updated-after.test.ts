import { describe, it, expect } from 'vitest'
import { parseListQuery } from '../../../../../src/verticals/accounting/router/helpers'

/**
 * Finding 22 — `updated_after` is documented, accepted, and inert.
 *
 * Incremental sync is the main reason anyone polls an aggregator, so this is
 * the most consequential missing capability in the product. Two separate
 * defects sit behind it:
 *
 *   1. Xero received the value as a QUERY PARAMETER named `IFModifiedSince`.
 *      Xero filters on the `If-Modified-Since` HTTP HEADER and ignores the
 *      query string entirely, so every value was silently discarded upstream.
 *      Covered in the adapter test alongside this one.
 *
 *   2. A malformed value produced `500 INTERNAL`. `parseListQuery` built
 *      `new Date(raw)` without validating, and the adapter later called
 *      `.toISOString()` on the Invalid Date, which throws `RangeError`. The
 *      caller sent bad input and was told the server was broken.
 *
 * The second is the one covered here: bad input must be a typed 400.
 */

describe('updated_after validation', () => {
  it('parses a valid ISO-8601 timestamp', () => {
    const p = parseListQuery({ updated_after: '2026-01-01T00:00:00.000Z' })
    expect(p.updatedAfter?.toISOString()).toBe('2026-01-01T00:00:00.000Z')
  })

  it('accepts a date-only value', () => {
    expect(parseListQuery({ updated_after: '2026-01-01' }).updatedAfter?.toISOString()).toBe(
      '2026-01-01T00:00:00.000Z',
    )
  })

  it('rejects a malformed value with a 400 rather than letting it become a 500', () => {
    // The exact live symptom: `?updated_after=not-a-date` answered
    // `{"error":{"code":"INTERNAL","message":"Internal Server Error"}}`.
    let thrown: unknown
    try {
      parseListQuery({ updated_after: 'not-a-date' })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(Error)
    expect((thrown as { statusCode?: number }).statusCode).toBe(400)
    expect((thrown as { code?: string }).code).toBe('VALIDATION')
    expect((thrown as Error).message).toMatch(/updated_after/)
  })

  it('names the offending value so the caller can see what was wrong', () => {
    try {
      parseListQuery({ updated_after: '2026-13-45' })
      throw new Error('should have thrown')
    } catch (err) {
      expect((err as Error).message).toContain('2026-13-45')
    }
  })

  it('leaves updatedAfter undefined when the param is absent', () => {
    expect(parseListQuery({}).updatedAfter).toBeUndefined()
  })

  it('treats an empty value as absent rather than as an error', () => {
    // A client that always appends `&updated_after=` should not get a 400 for
    // sending nothing.
    expect(parseListQuery({ updated_after: '' }).updatedAfter).toBeUndefined()
  })

  it('never yields an Invalid Date, which is what threw downstream', () => {
    for (const good of ['2026-01-01', '2026-01-01T10:00:00Z', '2026-01-01T10:00:00+02:00']) {
      const d = parseListQuery({ updated_after: good }).updatedAfter
      expect(Number.isNaN(d?.getTime())).toBe(false)
    }
  })
})

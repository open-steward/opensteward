/**
 * docs.espocrm.com/development/api/: "Date format: YYYY-MM-DD. Datetime
 * format: YYYY-MM-DD HH:mm:ss. All datetime values are represented in UTC
 * timezone, regardless of the settings."
 */
import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import {
  espoDateToIso,
  espoDatetimeToIso,
} from '../../../../../../../src/verticals/crm/adapters/espocrm/transform/datetime'

describe('espoDatetimeToIso', () => {
  it('reads the documented UTC datetime format', () => {
    const created = espoDatetimeToIso('2026-11-29 12:34:56')
    expect(created).toBe('2026-11-29T12:34:56Z')
    // Lands in a canonical datetime slot as is.
    expect(
      DealSchema.parse({ id: 'd', title: 't', created_at: created, metadata: {} }).created_at,
    ).toBe(created)
  })

  it('leaves an absent value absent', () => {
    expect(espoDatetimeToIso(null)).toBeUndefined()
    expect(espoDatetimeToIso(undefined)).toBeUndefined()
    expect(espoDatetimeToIso('')).toBeUndefined()
  })

  it('refuses any other shape instead of guessing a zone', () => {
    expect(() => espoDatetimeToIso('2026-02-28T23:59:01+02:00')).toThrow()
  })
})

describe('espoDateToIso', () => {
  it('reads the documented date format as midnight UTC', () => {
    const close = espoDateToIso('2026-12-31')
    expect(close).toBe('2026-12-31T00:00:00Z')
    expect(
      DealSchema.parse({ id: 'd', title: 't', close_date: close, metadata: {} }).close_date,
    ).toBe(close)
  })

  it('leaves an absent value absent and refuses other shapes', () => {
    expect(espoDateToIso(null)).toBeUndefined()
    expect(() => espoDateToIso('31/12/2026')).toThrow()
  })
})

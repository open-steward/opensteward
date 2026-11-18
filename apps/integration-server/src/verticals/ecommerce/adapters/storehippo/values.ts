/**
 * Small readers shared by the StoreHippo transforms. They read one documented
 * field each and never invent a value: an absent or malformed field comes
 * back `undefined`, and a required one throws.
 */

import { z } from 'zod'
import type { Money } from '../../schema/shared'
import { majorToMinor } from '../../schema/shared'

/** A number, or a numeric string (the docs' examples carry both: `"price": "300"`, `"list_price": 200`). */
export function numeric(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}

/** A whole, non-negative count read from a number or a numeric string. */
export function count(v: unknown): number | undefined {
  const n = numeric(v)
  return n !== undefined && Number.isInteger(n) && n >= 0 ? n : undefined
}

/** A non-empty string, else undefined. */
export function text(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined
}

/** A major-unit amount as canonical Money, or undefined when the amount or currency is missing. */
export function money(v: unknown, currency: string | undefined): Money | undefined {
  const n = numeric(v)
  if (n === undefined || !currency) return undefined
  return { amount: majorToMinor(n, currency), currency }
}

/** The record id every StoreHippo response carries as `_id`; a record without one is an error. */
export function recordId(raw: { _id?: unknown }, what: string): string {
  const id = raw._id
  if (typeof id === 'string' && id !== '') return id
  throw new Error(`StoreHippo ${what} has no _id`)
}

/** An alias usable as a canonical slug (lowercase letters, digits, hyphens), else undefined. */
export function slug(v: unknown): string | undefined {
  return typeof v === 'string' && /^[a-z0-9-]+$/.test(v) ? v : undefined
}

/** A 2-letter country code, as the address examples carry (`"country": "IN"`). */
export function countryCode(v: unknown): string | undefined {
  return typeof v === 'string' && /^[A-Z]{2}$/.test(v) ? v : undefined
}

const EMAIL = z.email()

/** An email address the canonical schemas accept, else undefined. */
export function email(v: unknown): string | undefined {
  return typeof v === 'string' && EMAIL.safeParse(v).success ? v : undefined
}

/** An ISO 4217 code as the documented currency fields carry it (`"name": "INR"`), else undefined. */
export function currencyCode(v: unknown): string | undefined {
  return typeof v === 'string' && /^[A-Z]{3}$/.test(v) ? v : undefined
}

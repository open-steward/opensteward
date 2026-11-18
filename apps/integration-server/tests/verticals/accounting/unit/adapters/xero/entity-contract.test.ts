import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Class guards 4, 6 and 8 from Handover 7, over the whole accounting surface.
 *
 * Five rounds have now produced the same failure: a fix lands on the entities
 * the report happened to name, and the rest keep the defect. FK integrity
 * (Handover 3), the timeout budget (4), pagination metadata (5), and in
 * Handover 7 both dates and FKs again. Each was found by a manual sweep, which
 * only reaches what someone thought to look at.
 *
 * These assert over every entity at once, so a new adapter file or a new
 * resource is covered on the day it is written rather than in a review round
 * months later.
 *
 * Source-level rather than behavioural because the property is "every mapper
 * does X" — reading the mappers checks that directly, where a behavioural test
 * would need a fixture per entity and would silently skip any entity nobody
 * remembered to add one for. That skip is the exact failure being guarded.
 */

const XERO = join(__dirname, '../../../../../../src/verticals/accounting/adapters/xero/transform')
const SCHEMA = join(__dirname, '../../../../../../src/verticals/accounting/schema')

interface Src {
  name: string
  body: string
}

function read(dir: string): Src[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => ({ name: f.replace(/\.ts$/, ''), body: readFileSync(join(dir, f), 'utf8') }))
}

const TRANSFORMS = read(XERO)
// `classification` is the data-access sidecar (field classes per resource
// type), not an entity schema.
const SCHEMAS = read(SCHEMA).filter(
  (s) =>
    s.name !== 'shared' && s.name !== 'index' && s.name !== 'webhook' && s.name !== 'classification',
)

describe('discovery', () => {
  it('finds the transforms and schemas it means to check', () => {
    // Guards the guards: an empty glob would make everything below vacuous.
    expect(TRANSFORMS.length).toBeGreaterThan(10)
    expect(SCHEMAS.length).toBeGreaterThan(10)
  })
})

/**
 * Guard 6 — no date-only source value acquires a fabricated time or zone.
 *
 * Xero states these as calendar dates. Routing one through `toUtcDate` (or a
 * bare `new Date`) invents midnight and a zone, which shows the previous day
 * to any consumer east of UTC. `accounting_transactions.createdAt` kept doing
 * this after `postedAt`/`dueAt` were fixed, so the same source date rendered
 * two ways depending on which tool was called.
 */
const DATE_ONLY_FIELDS = [
  'DateString',
  'DueDateString',
  'ExpiryDateString',
  'DeliveryDateString',
  'JournalDate',
]

describe('guard 6 — calendar dates stay calendar dates', () => {
  it.each(DATE_ONLY_FIELDS)('no transform routes raw.%s through an instant parser', (field) => {
    const offenders = TRANSFORMS.filter(
      (t) =>
        new RegExp(String.raw`toUtcDate\(\s*raw\.${field}\b`).test(t.body) ||
        new RegExp(String.raw`new Date\(\s*raw\.${field}\b`).test(t.body),
    ).map((t) => t.name)
    expect(offenders).toEqual([])
  })

  it('every use of a date-only source goes through toCalendarDate', () => {
    const offenders: string[] = []
    for (const t of TRANSFORMS) {
      for (const field of DATE_ONLY_FIELDS) {
        const used = new RegExp(String.raw`raw\.${field}\b`).test(t.body)
        if (!used) continue
        if (!new RegExp(String.raw`toCalendarDate\(\s*raw\.${field}\b`).test(t.body)) {
          offenders.push(`${t.name}.${field}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('a genuine instant is NOT downgraded to a calendar date', () => {
    // The converse error, and easy to make while fixing the first: Xero's
    // `UpdatedDateUTC` is a real moment. Truncating it to a date would
    // reintroduce the incremental-sync gap `updatedAt` exists to close.
    const offenders = TRANSFORMS.filter((t) =>
      /toCalendarDate\(\s*raw\.(UpdatedDateUTC|CreatedDateUTC)\b/.test(t.body),
    ).map((t) => t.name)
    expect(offenders).toEqual([])
  })
})

/**
 * Guard 8 — every entity carries the watermark `updated_after` filters on.
 *
 * `updated_after` shipped filtering on a value no response exposed, so a
 * client had no correct way to advance its poll cursor: its own clock loses
 * records modified while the request was in flight, and a safety margin is a
 * guess. `max(updatedAt)` is the standard answer and needs the field present.
 */
describe('guard 8 — updatedAt is present and populated', () => {
  it('every entity schema declares updatedAt', () => {
    const missing = SCHEMAS.filter((s) => !/^\s+updatedAt:/m.test(s.body)).map((s) => s.name)
    expect(missing).toEqual([])
  })

  it('every entity schema declares createdAt', () => {
    const missing = SCHEMAS.filter((s) => !/^\s+createdAt:/m.test(s.body)).map((s) => s.name)
    expect(missing).toEqual([])
  })

  it('every Xero transform that returns a record populates updatedAt', () => {
    // A declared-but-never-populated field is the same gap with extra steps.
    const returning = TRANSFORMS.filter((t) => /^export function transform/m.test(t.body))
    expect(returning.length).toBeGreaterThan(10)
    const missing = returning.filter((t) => !/\bupdatedAt:/.test(t.body)).map((t) => t.name)
    expect(missing).toEqual([])
  })
})

/**
 * Guard 4 — every line item exposes a resolvable account reference.
 *
 * Finding 17 reported `accountId` carrying a chart-of-accounts code instead of
 * the id `get_accounts` answers to. It was fixed on five entities; on
 * `orders`, `salesorders` and `purchaseorders` the field was simply absent —
 * worse, because there is no wrong value to notice.
 */
describe('guard 4 — line items carry an account reference', () => {
  const LINE_ITEM_TRANSFORMS = TRANSFORMS.filter((t) => /function mapLineItem/.test(t.body))

  it('finds the line-item mappers', () => {
    expect(LINE_ITEM_TRANSFORMS.length).toBeGreaterThan(5)
  })

  it('every line-item mapper emits accountId', () => {
    const missing = LINE_ITEM_TRANSFORMS.filter((t) => !/\baccountId:/.test(t.body)).map((t) => t.name)
    expect(missing).toEqual([])
  })

  it('no line-item mapper puts a chart-of-accounts CODE in accountId', () => {
    // The original defect shape. `accountCode` is where the code belongs.
    const offenders = LINE_ITEM_TRANSFORMS.filter((t) =>
      /accountId:\s*[\w.?]*\.AccountCode\b/.test(t.body),
    ).map((t) => t.name)
    expect(offenders).toEqual([])
  })

  it('every line-item mapper also exposes the human-facing accountCode', () => {
    const missing = LINE_ITEM_TRANSFORMS.filter((t) => !/\baccountCode:/.test(t.body)).map((t) => t.name)
    expect(missing).toEqual([])
  })
})

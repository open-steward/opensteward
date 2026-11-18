/**
 * Ozon warehouse → canonical Location.
 *
 * Source: `POST /v1/warehouse/list` (Ozon Seller API, WarehouseAPI). Response
 * shape and the `status` table (`new` / `created` / `disabled` / `blocked` /
 * `disabled_due_to_limit` / `error`) are from Ozon's official OpenAPI spec:
 *   https://docs.ozon.ru/api/seller/ (live, behind an anti-bot challenge)
 *   https://web.archive.org/web/20240531073337/https://docs.ozon.ru/api/seller/swagger.json
 * The path was confirmed live on 2026-09-13 (401 "Client-Id and Api-Key
 * headers are required", where an unknown path answers 404).
 */
import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawOzonWarehouse,
} from '../../../../../../../src/verticals/ecommerce/adapters/ozon/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

function makeWarehouse(overrides: Partial<RawOzonWarehouse> = {}): RawOzonWarehouse {
  return {
    warehouse_id: 18850503335000,
    name: 'Склад Москва',
    is_rfbs: false,
    status: 'created',
    has_entrusted_acceptance: false,
    can_print_act_in_advance: true,
    is_kgt: false,
    is_karantin: false,
    is_timetable_editable: true,
    has_postings_limit: false,
    postings_limit: -1,
    min_postings_limit: 10,
    min_working_days: 5,
    working_days: ['1', '2', '3', '4', '5'],
    first_mile_type: {
      dropoff_point_id: '',
      dropoff_timeslot_id: 0,
      first_mile_is_changing: false,
      first_mile_type: 'Pickup',
    },
    ...overrides,
  }
}

describe('ozon transformLocation', () => {
  it('maps the warehouse id (as a string) and name', () => {
    const loc = transformLocation(makeWarehouse())
    expect(loc.id).toBe('18850503335000')
    expect(loc.name).toBe('Склад Москва')
  })

  it('is active only for the documented `created` status', () => {
    expect(transformLocation(makeWarehouse({ status: 'created' })).active).toBe(true)
    for (const status of ['new', 'disabled', 'blocked', 'disabled_due_to_limit', 'error']) {
      expect(transformLocation(makeWarehouse({ status })).active).toBe(false)
    }
  })

  it('leaves `active` unset when Ozon reports no status', () => {
    const raw = makeWarehouse()
    delete raw.status
    expect(transformLocation(raw).active).toBeUndefined()
  })

  it('marks every seller warehouse as a fulfilment location', () => {
    expect(transformLocation(makeWarehouse()).isFulfillmentCenter).toBe(true)
  })

  it('does not invent an address — the method returns none', () => {
    expect(transformLocation(makeWarehouse()).address).toBeUndefined()
  })

  it('preserves the raw payload in metadata', () => {
    const raw = makeWarehouse()
    expect(transformLocation(raw).metadata).toBe(raw)
  })

  it('produces a payload that satisfies LocationSchema', () => {
    const parsed = LocationSchema.parse(transformLocation(makeWarehouse()))
    expect(parsed.id).toBe('18850503335000')
  })
})

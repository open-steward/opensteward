import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }))

vi.mock('../../../../../../../src/verticals/logistics/adapters/shiprocket/client', () => ({
  ShiprocketClient: class {
    get = getMock
  },
}))

import {
  transformCarrier,
  type ShiprocketCourier,
} from '../../../../../../../src/verticals/logistics/adapters/shiprocket/transform/carrier'
import { CarrierSchema } from '../../../../../../../src/verticals/logistics/schema/carrier'
import { ShiprocketAdapter } from '../../../../../../../src/verticals/logistics/adapters/shiprocket'
import type { Credentials } from '../../../../../../../src/verticals/logistics/adapter/interface'

/**
 * The adapter declared carrier unavailable — "no parameterless GET endpoint to
 * list carrier companies; only via serviceability, which needs two postcodes".
 * That was wrong: `GET courier/courierListWithCounts` is a company-level list
 * with no required parameters (published Postman collection, "List of
 * Couriers"). Its rows are NOT the serviceability rows `transform/rate.ts`
 * reads — they are keyed `id` / `name` / `status`, not `courier_company_id` /
 * `courier_name` — so this transform is its own shape rather than a reuse.
 */

/** The exact row shape from the published Postman example. */
function makeCourier(overrides: Partial<ShiprocketCourier> = {}): ShiprocketCourier {
  return {
    is_own_key_courier: 0,
    ownkey_courier_id: 0,
    id: 42,
    min_weight: 5,
    base_courier_id: 42,
    name: 'FedEx Surface 5 Kg',
    use_sr_postcodes: 1,
    type: 1,
    status: 1,
    courier_type: 0,
    master_company: 'FedEx Surface 5 Kg',
    service_type: 1,
    mode: 0,
    image: {
      logo: 'post_order/img/courier/FEDEX.png',
      small_logo: 'post_order/img/courier/thumb/fedex.jpg',
      email_logo_s3_path: 'fedex.png',
    },
    realtime_tracking: 'Real Time',
    delivery_boy_contact: 'Not Available',
    pod_available: 'Instant',
    call_before_delivery: 'Available',
    activated_date: '2021-06-21',
    newest_date: null,
    shipment_count: '',
    is_hyperlocal: 0,
    ...overrides,
  }
}

describe('shiprocket transformCarrier', () => {
  it('maps id, name and active', () => {
    const c = transformCarrier(makeCourier())
    expect(c.id).toBe('42')
    expect(c.name).toBe('FedEx Surface 5 Kg')
    expect(c.isActive).toBe(true)
  })

  it('stringifies the numeric id', () => {
    // Shiprocket sends a number; every id we expose is a string. This is the
    // value a shipment's `courier_company_id` joins back to.
    expect(typeof transformCarrier(makeCourier()).id).toBe('string')
  })

  it('uses the courier company id as the code, since Shiprocket has no carrier code', () => {
    expect(transformCarrier(makeCourier()).code).toBe('42')
  })

  it('falls back to master_company when name is null', () => {
    const c = transformCarrier(makeCourier({ name: null, master_company: 'FedEx' }))
    expect(c.name).toBe('FedEx')
  })

  it('leaves name undefined when both name fields are null', () => {
    const c = transformCarrier(makeCourier({ name: null, master_company: null }))
    expect(c.name).toBeUndefined()
  })

  it('reads status 0 as inactive and null as unknown', () => {
    // 1/0, the same convention the pickup-location transform reads for
    // warehouses. A missing status must stay undefined, not become false.
    expect(transformCarrier(makeCourier({ status: 0 })).isActive).toBe(false)
    expect(transformCarrier(makeCourier({ status: null })).isActive).toBeUndefined()
  })

  it('does not present activated_date as createdAt', () => {
    // It is the date the courier was enabled on the account, not when the
    // record was created; it stays available in metadata.
    const c = transformCarrier(makeCourier())
    expect(c.createdAt).toBeUndefined()
    expect(c.metadata?.activated_date).toBe('2021-06-21')
  })

  it('preserves the raw payload by reference', () => {
    const raw = makeCourier()
    expect(transformCarrier(raw).metadata).toBe(raw)
  })

  it('produces output the canonical schema accepts', () => {
    expect(() => CarrierSchema.parse(transformCarrier(makeCourier()))).not.toThrow()
  })

  it('parses a sparse row too', () => {
    const sparse = { id: 1 } as ShiprocketCourier
    expect(CarrierSchema.safeParse(transformCarrier(sparse)).success).toBe(true)
  })
})

/**
 * Envelope handling. The transform covers a row → Carrier; this covers the
 * step before it — the body the endpoint actually sends is
 * `{ total_courier_count, courier_count, ..., courier_data: [...] }`, and an
 * adapter reading `data` (the key every other Shiprocket list uses) would
 * return `[]` forever with a green 200.
 */
describe('ShiprocketAdapter carriers', () => {
  const credentials = { accessToken: 'TEST_token' } as Credentials
  const adapter = new ShiprocketAdapter()

  function envelope(rows: ShiprocketCourier[]) {
    return {
      total_courier_count: 72,
      serviceable_pincodes_count: 26416,
      pickup_pincodes_count: 25501,
      total_rto_count: 3380,
      total_oda_count: 2032,
      courier_count: rows.length,
      courier_data: rows,
    }
  }

  beforeEach(() => {
    getMock.mockReset()
  })

  it('listCarriers unwraps the courier_data envelope from courier/courierListWithCounts', async () => {
    getMock.mockResolvedValueOnce(
      envelope([makeCourier({ id: 2, name: 'FedEx' }), makeCourier({ id: 42 })]),
    )

    const out = await adapter.listCarriers(credentials, {})

    expect(getMock).toHaveBeenCalledWith('courier/courierListWithCounts')
    expect(out.map((c) => c.id)).toEqual(['2', '42'])
    for (const c of out) expect(() => CarrierSchema.parse(c)).not.toThrow()
  })

  it('listCarriers returns [] when courier_data is null', async () => {
    getMock.mockResolvedValueOnce({ ...envelope([]), courier_data: null })
    expect(await adapter.listCarriers(credentials, {})).toEqual([])
  })

  it('getCarrier finds the row by string id from the same list', async () => {
    // There is no by-id route; list-then-find, as getWarehouse does.
    getMock.mockResolvedValueOnce(
      envelope([makeCourier({ id: 2, name: 'FedEx' }), makeCourier({ id: 42 })]),
    )

    const c = await adapter.getCarrier(credentials, '42')

    expect(getMock).toHaveBeenCalledWith('courier/courierListWithCounts')
    expect(c.id).toBe('42')
    expect(c.name).toBe('FedEx Surface 5 Kg')
    expect(() => CarrierSchema.parse(c)).not.toThrow()
  })

  it('getCarrier throws a clear error when the id is not in the list', async () => {
    getMock.mockResolvedValueOnce(envelope([makeCourier({ id: 2 })]))
    await expect(adapter.getCarrier(credentials, '999')).rejects.toThrow(
      'Shiprocket courier not found: 999',
    )
  })
})

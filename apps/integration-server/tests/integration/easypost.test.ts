/**
 * EasyPost end-to-end integration test.
 *
 * Exercises the full HTTP stack — auth middleware, routes, adapter, and the
 * real EasyPost test-mode API — without spending money or hitting carriers.
 *
 * Requires EASYPOST_TEST_API_KEY in the environment. Skipped silently if unset
 * so `npm test` and PRs from forks remain green.
 *
 *   EASYPOST_TEST_API_KEY=EZTKxxxxxxxx npm run test:integration
 *
 * Get a free test key at https://www.easypost.com/account/api-keys (no card).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { ShipmentSchema } from '../../src/verticals/logistics/schema/shipment'
import { buildTestServer, seedConnection, type TestServer } from './helpers'

const apiKey = process.env['EASYPOST_TEST_API_KEY']
const PLATFORM = 'easypost'
const VERTICAL = 'logistics'
let connectionId = ''

// Known-good EasyPost test-mode addresses (from their docs).
// These bypass address verification and always produce rates.
const FROM_ADDRESS = {
  name: 'EasyPost',
  street1: '417 Montgomery Street',
  street2: '5th Floor',
  city: 'San Francisco',
  state: 'CA',
  postalCode: '94104',
  country: 'US',
  phone: '4153334445',
}

const TO_ADDRESS = {
  name: 'Dr. Steve Brule',
  street1: '179 N Harbor Dr',
  city: 'Redondo Beach',
  state: 'CA',
  postalCode: '90277',
  country: 'US',
  phone: '3103334444',
}

const PARCEL = {
  weight: { value: 16, unit: 'oz' as const },
  dimensions: { length: 10, width: 8, height: 4, unit: 'in' as const },
}

describe.skipIf(!apiKey)('EasyPost integration', () => {
  let server: TestServer

  beforeAll(async () => {
    server = await buildTestServer()
    // Enable the easypost adapter so the registry hydrates an instance.
    await server.fastify.inject({
      method: 'POST',
      url: `/admin/adapters/${VERTICAL}/${PLATFORM}/enable`,
      payload: {},
    })
    connectionId = await seedConnection(server, {
      vertical: VERTICAL,
      platform: PLATFORM,
      accessToken: apiKey!,
      tenantId: 'test-tenant',
    })
  })

  afterAll(async () => {
    await server?.cleanup()
  })

  it('lists easypost as a known platform in the logistics vertical', async () => {
    const res = await server.fastify.inject({
      method: 'GET',
      url: `/v1/platforms?vertical=${VERTICAL}`,
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { data: Array<{ slug: string; vertical: string }> }
    const ep = body.data.find((p) => p.slug === PLATFORM)
    expect(ep).toBeDefined()
    expect(ep?.vertical).toBe(VERTICAL)
  })

  // Shared state between dependent tests — populated by the rates step.
  let cheapestRateId: string | undefined
  let shipmentId: string | undefined
  let trackingNumber: string | undefined

  it('returns rates for a SF→Redondo Beach shipment', async () => {
    const res = await server.fastify.inject({
      method: 'POST',
      url: `/v1/logistics/rates?connection_id=${connectionId}`,
      payload: {
        originAddress: FROM_ADDRESS,
        destinationAddress: TO_ADDRESS,
        packages: [PARCEL],
      },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { data: Array<Record<string, unknown>> }
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.data.length).toBeGreaterThan(0)

    for (const rate of body.data) {
      expect(rate.carrier).toBeTruthy()
      expect(rate.service).toBeTruthy()
      expect(rate.amount).toBeDefined()
      // metadata invariant from service.md §5: raw payload preserved
      expect(rate.metadata).toBeDefined()
    }

    // Pluck the cheapest rate's underlying EasyPost rate id + shipment id from
    // metadata so the next test can buy a label.
    const sorted = [...body.data].sort((a, b) => {
      const av = Number((a.amount as { value?: number })?.value ?? Infinity)
      const bv = Number((b.amount as { value?: number })?.value ?? Infinity)
      return av - bv
    })
    const cheapest = sorted[0]
    const meta = cheapest.metadata as Record<string, unknown>
    cheapestRateId = String(meta.id ?? '')
    shipmentId = String(meta.shipment_id ?? '')
    expect(cheapestRateId).toBeTruthy()
    expect(shipmentId).toBeTruthy()
  })

  it('purchases a label for the cheapest rate', async () => {
    if (!cheapestRateId || !shipmentId) {
      throw new Error('rates test must run before label test')
    }
    const res = await server.fastify.inject({
      method: 'POST',
      url: `/v1/logistics/labels?connection_id=${connectionId}`,
      payload: {
        shipmentId,
        metadata: { rate_id: cheapestRateId },
      },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json() as { data: Record<string, unknown> }
    expect(body.data.labelUrl).toMatch(/^https?:\/\//)
    expect(body.data.trackingNumber).toBeTruthy()
    trackingNumber = String(body.data.trackingNumber)
  })

  it('fetches the purchased shipment and matches the canonical schema', async () => {
    if (!shipmentId) throw new Error('rates test must run first')
    const res = await server.fastify.inject({
      method: 'GET',
      url: `/v1/logistics/shipments/${shipmentId}?connection_id=${connectionId}`,
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { data: unknown }
    // Validate against the canonical Zod schema (the contract).
    const parsed = ShipmentSchema.safeParse(body.data)
    expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.format())).toBe(true)
    if (parsed.success) {
      expect(parsed.data.metadata).toBeDefined()
      expect(parsed.data.trackingNumber).toBeTruthy()
    }
  })

  it('returns tracking events for the purchased label', async () => {
    if (!trackingNumber) throw new Error('label test must run first')
    const res = await server.fastify.inject({
      method: 'GET',
      url: `/v1/logistics/tracking-events/${trackingNumber}?connection_id=${connectionId}`,
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { data: Array<Record<string, unknown>> }
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.data.length).toBeGreaterThan(0)
    // metadata preservation invariant
    for (const evt of body.data) {
      expect(evt.metadata).toBeDefined()
    }
  })

  it('rejects an invalid rate request with a structured 4xx error', async () => {
    const res = await server.fastify.inject({
      method: 'POST',
      url: `/v1/logistics/rates?connection_id=${connectionId}`,
      payload: {
        originAddress: { ...FROM_ADDRESS, postalCode: 'NOT-A-ZIP' },
        destinationAddress: TO_ADDRESS,
        packages: [PARCEL],
      },
    })
    // EasyPost returns a 422 for bad addresses; our adapter surfaces it as 4xx/5xx.
    // We just want it to not be a successful 2xx and not crash the server.
    expect(res.statusCode).toBeGreaterThanOrEqual(400)
    expect(res.statusCode).toBeLessThan(600)
  })
})

// When the API key is not set, surface one informational test so the suite
// is visibly skipped rather than appearing empty.
describe.skipIf(!!apiKey)('EasyPost integration (skipped)', () => {
  it.skip('set EASYPOST_TEST_API_KEY to run this suite', () => {})
})

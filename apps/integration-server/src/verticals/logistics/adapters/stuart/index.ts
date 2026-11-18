// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier  — Stuart dispatches its own on-demand couriers; no carrier listing endpoint exists
// Unavailable: label    — Stuart does not issue shipping labels; couriers collect packages directly
// Unavailable: manifest — Stuart has no manifest concept; jobs are individual on-demand dispatches
// Unavailable: warehouse — Stuart has no warehouse management; pickup addresses are per-job
import type { LogisticsAdapter, Credentials, RateRequestParams, QueryParams } from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Order } from '../../schema/order'

import { buildAuthUrl, exchangeCredentials, refreshCredentials as doRefresh } from './auth'
import { StuartClient } from './client'
import { transformTracking, type StuartJob } from './transform/tracking'
import { transformShipment, type StuartShipment } from './transform/shipment'
import { transformRate, type StuartPricing } from './transform/rate'
import { transformOrder, type StuartJobOrder, type StuartJobsListResponse } from './transform/order'

export class StuartAdapter implements LogisticsAdapter {
  readonly platform = 'stuart'
  readonly version = '1'

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    const [clientId, clientSecret] = code.split(':')
    return exchangeCredentials({ clientId, clientSecret })
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new StuartClient(credentials)
    const raw = await client.get<StuartJob>(`jobs/${trackingNumber}`)
    return transformTracking(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new StuartClient(credentials)
    const raw = await client.post<StuartShipment>('jobs', {
      job: {
        pickups: data.originAddress ? [{ address: data.originAddress }] : undefined,
        dropoffs: data.destinationAddress
          ? [{ address: data.destinationAddress, client_reference: data.reference }]
          : undefined,
      },
    })
    return transformShipment(raw)
  }

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new StuartClient(credentials)
    const raw = await client.post<StuartPricing>('jobs/pricing', {
      job: {
        pickups: [{ address: params.originAddress }],
        dropoffs: [{ address: params.destinationAddress }],
      },
    })
    return [transformRate(raw)]
  }

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new StuartClient(credentials)
    const raw = await client.get<StuartJobsListResponse | StuartJobOrder[]>('jobs', params as Record<string, unknown>)
    const jobs: StuartJobOrder[] = Array.isArray(raw) ? raw : (raw.jobs ?? [])
    return jobs.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new StuartClient(credentials)
    const raw = await client.get<StuartJobOrder>(`jobs/${id}`)
    return transformOrder(raw)
  }
}

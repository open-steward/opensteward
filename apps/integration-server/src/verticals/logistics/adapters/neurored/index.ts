// ── Resource coverage ──────────────────────────────────────────────
// Available:   shipment, trackingevent
// Unverified:  carrier   — Neurored API docs not publicly accessible; NR_ object name and fields unconfirmable
// Unverified:  label     — Neurored API docs not publicly accessible; NR_ object name and fields unconfirmable
// Unverified:  manifest  — Neurored API docs not publicly accessible; NR_ object name and fields unconfirmable
// Unverified:  order     — Neurored API docs not publicly accessible; NR_ object name and fields unconfirmable
// Unverified:  rate      — Neurored API docs not publicly accessible; NR_ object name and fields unconfirmable
// Unverified:  warehouse — Neurored API docs not publicly accessible; NR_ object name and fields unconfirmable

import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'

import { buildAuthUrl, exchangeCode as doExchangeCode, refreshCredentials as doRefresh } from './auth'
import { NeuroredClient } from './client'
import { NEURORED_SHIPMENT_OBJECT, NEURORED_TRACKING_OBJECT } from './constants'

import { transformShipment, type NeuroredShipmentRecord } from './transform/shipment'
import { transformTrackingEvents, type NeuroredTrackingEventRecord } from './transform/tracking'

export interface NeuroredAdapterConfig {
  clientId?: string
  clientSecret?: string
  redirectUri?: string
}

// SOQL field lists
const SHIPMENT_FIELDS = [
  'Id',
  'Name',
  'NR_TrackingNumber__c',
  'NR_Status__c',
  'NR_ServiceType__c',
  'NR_CarrierName__c',
  'NR_Mode__c',
  'NR_TotalWeight__c',
  'NR_WeightUnit__c',
  'NR_EstimatedDelivery__c',
  'NR_ActualDelivery__c',
  'NR_LabelUrl__c',
  'NR_Reference__c',
  'NR_Notes__c',
  'NR_OriginName__c',
  'NR_OriginCompany__c',
  'NR_OriginStreet__c',
  'NR_OriginCity__c',
  'NR_OriginState__c',
  'NR_OriginPostalCode__c',
  'NR_OriginCountry__c',
  'NR_OriginPhone__c',
  'NR_OriginEmail__c',
  'NR_DestName__c',
  'NR_DestCompany__c',
  'NR_DestStreet__c',
  'NR_DestCity__c',
  'NR_DestState__c',
  'NR_DestPostalCode__c',
  'NR_DestCountry__c',
  'NR_DestPhone__c',
  'NR_DestEmail__c',
  'CreatedDate',
  'LastModifiedDate',
].join(', ')

const TRACKING_FIELDS = [
  'Id',
  'Name',
  'NR_Shipment__c',
  'NR_TrackingNumber__c',
  'NR_Status__c',
  'NR_Description__c',
  'NR_EventDate__c',
  'NR_LocationCity__c',
  'NR_LocationState__c',
  'NR_LocationPostalCode__c',
  'NR_LocationCountry__c',
  'NR_LocationStreet__c',
].join(', ')

export class NeuroredAdapter implements LogisticsAdapter {
  readonly platform = 'neurored'
  readonly version = '1'

  private config: NeuroredAdapterConfig

  constructor(config: NeuroredAdapterConfig = {}) {
    this.config = config
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(state, {
      clientId: this.config.clientId,
      redirectUri: this.config.redirectUri,
      scopes: overrideScopes,
    })
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error('neurored: clientId and clientSecret are required')
    }
    return doExchangeCode(code, redirectUri, {
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
      redirectUri,
    })
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  /**
   * Neurored uses Salesforce Platform Events / Outbound Messages for webhook-like
   * notifications. There is no HMAC signature on the payload, so we cannot
   * verify authenticity cryptographically. Always returns false.
   */
  verifyWebhook(_payload: Buffer, _headers: Record<string, string>): boolean {
    return false
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new NeuroredClient(credentials)
    const limit = params.limit ?? 50
    const offset = ((params.page ?? 1) - 1) * limit

    const soql = `SELECT ${SHIPMENT_FIELDS} FROM ${NEURORED_SHIPMENT_OBJECT} ORDER BY CreatedDate DESC LIMIT ${limit} OFFSET ${offset}`
    const result = await client.query<NeuroredShipmentRecord>(soql)
    return result.records.map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new NeuroredClient(credentials)
    const soql = `SELECT ${SHIPMENT_FIELDS} FROM ${NEURORED_SHIPMENT_OBJECT} WHERE Id = '${id}' LIMIT 1`
    const result = await client.query<NeuroredShipmentRecord>(soql)

    if (!result.records.length) {
      throw new Error(`Neurored: shipment not found — id=${id}`)
    }

    return transformShipment(result.records[0])
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    const client = new NeuroredClient(credentials)
    const limit = params.limit ?? 100
    const offset = ((params.page ?? 1) - 1) * limit

    const soql = `SELECT ${TRACKING_FIELDS} FROM ${NEURORED_TRACKING_OBJECT} ORDER BY NR_EventDate__c DESC LIMIT ${limit} OFFSET ${offset}`
    const result = await client.query<NeuroredTrackingEventRecord>(soql)
    return transformTrackingEvents(result.records)
  }

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new NeuroredClient(credentials)
    const soql = `SELECT ${TRACKING_FIELDS} FROM ${NEURORED_TRACKING_OBJECT} WHERE NR_TrackingNumber__c = '${trackingNumber}' ORDER BY NR_EventDate__c ASC`
    const records = await client.queryAll<NeuroredTrackingEventRecord>(soql)
    return transformTrackingEvents(records)
  }
}

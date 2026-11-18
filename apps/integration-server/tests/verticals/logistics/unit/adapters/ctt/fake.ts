/**
 * A fake CTT (Pakketmail) API that honours only what the docs define:
 *
 *  - the base URL https://enviosecommerceapi.ctt.pt/v3/ (CTT's OpenAPI `servers`);
 *  - the X-APPID header on every request (https://api.pakketmail.nl/v3/apidocs/usa/using);
 *  - HTTP Basic with username = token (public key on /keys/ only) and
 *    password = base64(HMAC-SHA256(user + body, secret)) without padding
 *    (https://api.pakketmail.nl/v3/apidocs/usa/authenticate);
 *  - GET shipments/newsince/:startNumber/:iso3339Date, 25 per page, no body;
 *  - GET carriers/, one unpaged reply under `Carrier`;
 *  - POST tracking/ with TrackingIdList;
 *  - POST keys/ with PlatformVersion, PluginVersion, ShopUrl → { Key, Expire }.
 */
import { createHmac } from 'node:crypto'
import { vi, type Mock, type MockInstance } from 'vitest'
import axios from 'axios'
import type { CttShipmentListResponse } from '../../../../../../src/verticals/logistics/adapters/ctt/transform/shipment'
import { shipment } from './fixtures'

export const BASE = 'https://enviosecommerceapi.ctt.pt/v3/'
export const CALL_BUDGET = 40

export interface FakeKeys {
  appId: string
  publicKey: string
  secretKey: string
  shopUrl: string
}

export function keysFor(publicKey: string): FakeKeys {
  return { appId: 'APP-1', publicKey, secretKey: 'SECRET-1', shopUrl: 'https://shop.example.test' }
}

export function credsFor(keys: FakeKeys, token = 'TOKEN-1', expiresAt?: Date) {
  return { accessToken: token, expiresAt, extra: { ...keys } }
}

function hash(user: string, body: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(user + body)
    .digest('base64')
    .replace(/=+$/, '')
}

function checkAuth(header: unknown, user: string, body: string, secret: string): void {
  const want = `Basic ${Buffer.from(`${user}:${hash(user, body, secret)}`).toString('base64')}`
  if (header !== want) throw Object.assign(new Error('401'), { response: { status: 401 } })
}

export interface Sent {
  method: string
  url: string
  data?: string
}

export interface FakeOptions {
  shipments?: number
  carriers?: CttCarrierRows
  tracking?: unknown
  /** Answer newsince with an empty object (no ShipmentCount, no Shipments). */
  bareNewsince?: boolean
  /** Answer newsince with Shipments but no ShipmentCount. */
  newsinceNoCount?: boolean
  /** Shipments in the window, by the iso3339Date sent; overrides `shipments`. */
  shipmentsBySince?: Record<string, number>
  /** The whole GET carriers/ reply, in place of the `carriers` default. */
  carriersReply?: unknown
  /** Tokens the server accepts; a request under any other is a 401. */
  validTokens?: string[]
  /** The token POST /keys/ hands out. */
  issue?: string
}

type CttCarrierRows = unknown[]

const NEWSINCE = /^shipments\/newsince\/(\d+)\/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)$/

/** What fakeCtt hands back. Spelled out: the inferred type names vitest's internal symbols. */
export interface FakeCtt {
  sent: Sent[]
  tokenRequests: Array<{ body: Record<string, unknown> }>
  request: Mock
  create: MockInstance
  post: MockInstance
  valid: Set<string>
}

export function fakeCtt(keys: FakeKeys, opts: FakeOptions = {}): FakeCtt {
  const sent: Sent[] = []
  const tokenRequests: Array<{ body: Record<string, unknown> }> = []
  const valid = new Set(opts.validTokens ?? ['TOKEN-1'])
  let calls = 0

  const request = vi.fn(
    async (cfg: {
      method: string
      url: string
      data?: string
      headers?: Record<string, string>
    }) => {
      if (++calls > CALL_BUDGET) throw new Error(`call budget (${CALL_BUDGET}) exceeded`)
      const body = cfg.data ?? ''
      sent.push({ method: cfg.method, url: cfg.url, data: cfg.data })
      const auth = cfg.headers?.['Authorization'] ?? ''
      const token = Buffer.from(auth.replace(/^Basic /, ''), 'base64')
        .toString()
        .split(':')[0]!
      if (!valid.has(token)) throw Object.assign(new Error('401'), { response: { status: 401 } })
      checkAuth(auth, token, body, keys.secretKey)

      if (cfg.method === 'GET') {
        if (cfg.data !== undefined) throw new Error('400: GET carries no data')
        const m = NEWSINCE.exec(cfg.url)
        if (m) {
          if (opts.bareNewsince) return { data: {} }
          const start = Number(m[1])
          if (start < 1) throw new Error('400: startNumber starts at 1')
          const total = opts.shipmentsBySince?.[m[2]!] ?? opts.shipments ?? 0
          const ids: number[] = []
          for (let i = start; i < start + 25 && i <= total; i++) ids.push(1000 + i)
          if (opts.newsinceNoCount) return { data: { Shipments: ids.map(shipment) } }
          const reply: CttShipmentListResponse = {
            ShipmentCount: ids.length,
            Shipments: ids.map(shipment),
          }
          return { data: reply }
        }
        if (cfg.url === 'carriers/')
          return { data: opts.carriersReply ?? { Error: { Id: 0 }, Carrier: opts.carriers ?? [] } }
      }
      if (cfg.method === 'POST' && cfg.url === 'tracking/') {
        const parsed = JSON.parse(body) as Record<string, unknown>
        const allowed = ['TrackingIdList', 'ClientReferenceCodeList', 'StartItem', 'UpdatesSince']
        const bad = Object.keys(parsed).filter((k) => !allowed.includes(k))
        if (bad.length) throw new Error(`400: undocumented fields ${bad.join(',')}`)
        return { data: opts.tracking ?? { Shipments: {} } }
      }
      throw new Error(`404: ${cfg.method} ${cfg.url}`)
    },
  )

  const create = vi.spyOn(axios, 'create').mockImplementation(((cfg: {
    baseURL?: string
    headers?: Record<string, string>
  }) => {
    if (cfg.baseURL !== BASE) throw new Error(`wrong base URL ${cfg.baseURL}`)
    if (cfg.headers?.['X-APPID'] !== keys.appId) throw new Error('X-APPID header missing')
    return { request }
  }) as never)

  const post = vi.spyOn(axios, 'post').mockImplementation((async (
    url: string,
    body: string,
    cfg: { headers?: Record<string, string> },
  ) => {
    if (url !== `${BASE}keys/`) throw new Error(`404: POST ${url}`)
    if (cfg.headers?.['X-APPID'] !== keys.appId) throw new Error('X-APPID header missing')
    checkAuth(cfg.headers?.['Authorization'], keys.publicKey, body, keys.secretKey)
    const parsed = JSON.parse(body) as Record<string, unknown>
    tokenRequests.push({ body: parsed })
    for (const k of ['PlatformVersion', 'PluginVersion', 'ShopUrl'])
      if (typeof parsed[k] !== 'string' || !parsed[k]) throw new Error(`400: ${k} required`)
    const issued = opts.issue ?? 'TOKEN-2'
    valid.add(issued)
    return { data: { Key: issued, Expire: '2026-12-31', Error: { Id: 0 } } }
  }) as never)

  return { sent, tokenRequests, request, create, post, valid }
}

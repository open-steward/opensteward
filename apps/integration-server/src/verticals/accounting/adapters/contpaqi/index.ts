/**
 * ContPAQi accounting adapter.
 *
 * Every resource method this adapter used to implement called a path under
 * `https://api.contpaqi.com/v1` (constants.ts). A live probe of that host
 * (2026-09-13) returns HTTP 403 "Web App - Unavailable" as plain
 * HTML — it is not an API gateway, so every one of those 35 methods across
 * 13 resources was a phantom: a request no ContPAQi deployment can ever
 * answer. Whether the vendor documents a different, real API behind its
 * login-walled developer portal cannot be checked from here.
 *
 * All 35 resource methods were removed. Only auth
 * (getAuthUrl/exchangeCode/refreshCredentials) remains — it targets
 * `identity.contpaqi.com`, a separate host from the dead `api.contpaqi.com`,
 * and was left untouched by the phantom-method removal. This adapter is non-functional
 * until a real, reachable ContPAQi API surface is identified.
 *
 * ── Resource coverage ──────────────────────────────────────────────────────────
 * Unavailable: account       — every path this adapter called lives under https://api.contpaqi.com/v1, which returns HTTP 403 "Web App - Unavailable" (plain HTML, not an API gateway) on a live probe; GET /cuentas is unreachable
 * Unavailable: bill          — every path this adapter called lives under https://api.contpaqi.com/v1, which returns HTTP 403 "Web App - Unavailable" (plain HTML, not an API gateway) on a live probe; GET /facturas-proveedor is unreachable
 * Unavailable: contact       — every path this adapter called lives under https://api.contpaqi.com/v1, which returns HTTP 403 "Web App - Unavailable" (plain HTML, not an API gateway) on a live probe; GET /clientes and /proveedores are unreachable
 * Unavailable: creditmemo    — every path this adapter called lives under https://api.contpaqi.com/v1, which returns HTTP 403 "Web App - Unavailable" (plain HTML, not an API gateway) on a live probe; GET /notas-credito is unreachable
 * Unavailable: expense       — every path this adapter called lives under https://api.contpaqi.com/v1, which returns HTTP 403 "Web App - Unavailable" (plain HTML, not an API gateway) on a live probe; GET /gastos is unreachable
 * Unavailable: invoice       — every path this adapter called lives under https://api.contpaqi.com/v1, which returns HTTP 403 "Web App - Unavailable" (plain HTML, not an API gateway) on a live probe; GET /facturas is unreachable
 * Unavailable: journal       — every path this adapter called lives under https://api.contpaqi.com/v1, which returns HTTP 403 "Web App - Unavailable" (plain HTML, not an API gateway) on a live probe; GET /polizas is unreachable
 * Unavailable: order         — every path this adapter called lives under https://api.contpaqi.com/v1, which returns HTTP 403 "Web App - Unavailable" (plain HTML, not an API gateway) on a live probe; GET /pedidos is unreachable
 * Unavailable: organization  — every path this adapter called lives under https://api.contpaqi.com/v1, which returns HTTP 403 "Web App - Unavailable" (plain HTML, not an API gateway) on a live probe; GET /empresas/actual is unreachable
 * Unavailable: purchaseorder — every path this adapter called lives under https://api.contpaqi.com/v1, which returns HTTP 403 "Web App - Unavailable" (plain HTML, not an API gateway) on a live probe; GET /ordenes-compra is unreachable
 * Unavailable: salesorder    — every path this adapter called lives under https://api.contpaqi.com/v1, which returns HTTP 403 "Web App - Unavailable" (plain HTML, not an API gateway) on a live probe; GET /ordenes-venta is unreachable
 * Unavailable: taxrate       — every path this adapter called lives under https://api.contpaqi.com/v1, which returns HTTP 403 "Web App - Unavailable" (plain HTML, not an API gateway) on a live probe; GET /impuestos is unreachable
 * Unavailable: transaction   — every path this adapter called lives under https://api.contpaqi.com/v1, which returns HTTP 403 "Web App - Unavailable" (plain HTML, not an API gateway) on a live probe; GET /movimientos is unreachable
 */

import type { AccountingAdapter, Credentials } from '../../adapter/interface'

import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'

interface ContpaqiAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

export class ContpaqiAdapter implements AccountingAdapter {
  readonly platform = 'contpaqi'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: ContpaqiAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, (overrideScopes ?? this.scopes), state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return exchangeCode(code, this.clientId, this.clientSecret, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) throw new Error('No refresh token available')
    return refreshAccessToken(credentials.refreshToken, this.clientId, this.clientSecret)
  }
}

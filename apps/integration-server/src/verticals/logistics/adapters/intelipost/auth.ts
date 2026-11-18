import type { Credentials } from '../../adapter/interface'
import { INTELIPOST_DASHBOARD_URL } from './constants'

/**
 * Intelipost uses API key authentication — not OAuth2.
 *
 * getAuthUrl:          Returns the Intelipost API keys page (no redirect flow).
 * exchangeApiKey:      Treats the supplied key as the credential directly.
 * refreshCredentials:  API keys do not expire; returns existing credentials unchanged.
 */

export function buildAuthUrl(_state: string): string {
  // Intelipost has no OAuth2 flow — direct users to their API keys settings page.
  return INTELIPOST_DASHBOARD_URL
}

export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  // The API key IS the credential — no exchange required.
  return {
    accessToken: apiKey,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Intelipost API keys do not expire.
  return credentials
}

/**
 * The Intelipost auth header. The TMS Embarcador OpenAPI export declares
 * `"securityDefinitions": {"api-key": {"name": "api-key", "type": "apiKey", "in": "header"}`
 * (https://stoplight.io/api/v1/projects/intelipost/tms-embarcador/nodes/reference/openapi.json?fromExportButton=true&snapshotType=http_service),
 * and each operation this adapter calls (GET /shipment_order/{pedido_de_entrega},
 * GET /shipment_order/tracking_code/{codigo_rastreamento},
 * GET /shipment_order/get_label/{pedido_envio}/{numero_volume}, POST /quote)
 * names it in its `security` requirement (`{"api-key": []}`); 29 of the 95
 * operations also list it as a header parameter, and none declares `api_key`.
 * The webhook section says why: "Notamos que alguns webservers não aceitam a
 * api_key com “_”, então optamos por deixar como: api-key." — a hyphen, not
 * the underscore this adapter used to send.
 */
export function apiKeyHeader(apiKey: string): Record<string, string> {
  return { 'api-key': apiKey }
}

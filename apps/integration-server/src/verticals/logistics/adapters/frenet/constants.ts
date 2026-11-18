/**
 * Frenet API constants.
 *
 * Frenet documents two hosts (https://docs.frenet.com.br/llms.txt indexes one
 * OpenAPI definition per reference page):
 *
 *   - `https://api.frenet.com.br`, no version prefix: tracking and quotes.
 *     trackorder: `"servers": [{"url":"http://api.frenet.com.br"},{"url":"https://api.frenet.com.br"}]`,
 *     path `/tracking/trackinginfo`. The older Apiary blueprint
 *     (https://frenetapi.docs.apiary.io/api-description-document) agrees:
 *     `### HOST: api.frenet.com.br` / `### /shipping/quote`.
 *   - `https://whitelabel.frenet.com.br/v1`: shipments, orders and labels.
 *     getshipmentsasync, getordersasync, getshipmentasync, getorderasync and
 *     getshipmentlabelasync all declare
 *     `"servers": [{"url":"https://whitelabel.frenet.com.br/v1"}]`.
 */
export const FRENET_API_BASE = 'https://api.frenet.com.br'

/** Host of the WhiteLabel Shipments and Orders Integration APIs. */
export const FRENET_WHITELABEL_BASE = 'https://whitelabel.frenet.com.br/v1'

/**
 * Where a merchant finds their token. Apiary blueprint: "Acesse
 * https://painel.frenet.com.br e obtenha o seu token em "Dados Cadastrais"."
 */
export const FRENET_DASHBOARD_URL = 'https://painel.frenet.com.br'

/** Client token header: `{"in": "header", "name": "token", "required": true}`. */
export const FRENET_AUTH_HEADER = 'token'

/**
 * Partner token header, required on every WhiteLabel route:
 * `{"in": "header", "name": "x-partner-token", "required": true, "description": "Token do parceiro"}`.
 */
export const FRENET_PARTNER_HEADER = 'x-partner-token'

/**
 * Rows asked for when a direct caller passes no `limit`. The router always
 * passes one; Frenet documents neither a default nor a maximum for `per_page`.
 */
export const DEFAULT_PAGE_SIZE = 20

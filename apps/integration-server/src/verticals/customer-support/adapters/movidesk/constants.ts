/**
 * Movidesk (Zenvia Service) REST API constants.
 *
 * Base URL: https://api.movidesk.com/public/v1
 * Auth: token passed as query param `token=<api_key>`
 * Pagination: OData $top / $skip
 * Rate limit: 10 requests per minute
 */
export const API_BASE_URL = 'https://api.movidesk.com/public/v1'

/** Page size sent when the caller names none. */
export const DEFAULT_PAGE_SIZE = 100

/**
 * Most rows one request can return: "O Movidesk trabalha com um limite de
 * 1000 registros é o máximo de request por consulta"
 * (https://atendimento.movidesk.com/kb/pt-br/article/122106/criaratualizar-artigo).
 */
export const MAX_PAGE_SIZE = 1000

// ── Ticket resource paths ────────────────────────────────────────────────────
export const TICKETS_PATH = '/tickets'

// ── People (contacts + agents) resource path ─────────────────────────────────
export const PERSONS_PATH = '/persons'

// ── Services (categories) resource path ──────────────────────────────────────
export const SERVICES_PATH = '/services'

// ── Profile-type values returned in person objects ───────────────────────────
/** profileType=1 → agent/employee */
export const PROFILE_TYPE_AGENT = 1
/** profileType=2 → client/contact */
export const PROFILE_TYPE_CLIENT = 2
/** profileType=3 → agent AND client */
export const PROFILE_TYPE_BOTH = 3

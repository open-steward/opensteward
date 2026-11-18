/**
 * Wekan is a self-hosted open-source kanban board.
 * The base URL is supplied per-installation via credentials (serverUrl).
 * All API paths are relative to that base.
 */

/** Path prefix for all REST API endpoints. */
export const API_PREFIX = '/api'

/** Login endpoint (no /api prefix). */
export const LOGIN_PATH = '/users/login'

/** Virtual workspace ID used when Wekan has no native workspace concept. */
export const VIRTUAL_WORKSPACE_ID = 'wekan'

/**
 * Wekan does not document pagination parameters; the API returns full result
 * sets per resource (boards, lists, cards, etc.).
 */
export const DEFAULT_PAGE_SIZE = 200

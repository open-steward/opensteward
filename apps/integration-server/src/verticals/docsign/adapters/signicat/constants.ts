/**
 * Signicat Sign API v2 constants.
 *
 * Signicat exposes every API product on a single host — api.signicat.com —
 * gated by OAuth 2.0 client-credentials tokens (scope `signicat-api`). The
 * Sign API v2 manages signing sessions, document collections, and documents;
 * the canonical docsign "envelope" maps to a Signicat signing session.
 *
 * Docs:
 *   https://developer.signicat.com/docs/electronic-signing/sign-api-v2/
 *   https://developer.signicat.com/docs/connect-to-signicat-apis/quick-start-guide/
 */

/** Sign API v2 REST base — signing sessions, documents, document collections. */
export const API_BASE_URL = 'https://api.signicat.com/sign'

/** OAuth 2.0 token endpoint (client-credentials grant). */
export const OAUTH_TOKEN_URL = 'https://api.signicat.com/auth/open/connect/token'

/** Every Signicat API product is reached with the single `signicat-api` scope. */
export const DEFAULT_SCOPES = ['signicat-api']

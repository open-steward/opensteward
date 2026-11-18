/**
 * Sphereon eIDAS Signature REST API constants.
 *
 * Sphereon's eIDAS Advanced Electronic Signature service is exposed through
 * the VDX (Verifiable Data Exchange) cloud gateway. It is a cryptographic
 * signing-primitive API: it manages signature *configurations* (reusable
 * definitions of a signature level + digest algorithm + form parameters)
 * plus the key providers/certificates used to produce eIDAS-compliant X.509
 * signatures. It has no envelope/recipient signing-workflow surface, so the
 * adapter only maps the resources Sphereon actually exposes.
 *
 * Docs: https://docs.vdx.sphereon.com/api/eidas/signatures
 * Auth: bearer API token (`Authorization: Bearer <token>`).
 */

/** Sphereon VDX cloud production base URL. */
export const API_BASE_URL = 'https://gw.api.cloud.sphereon.com/eidas-signatures/v1'

/**
 * Self-hosted / sandbox base URL. The eIDAS signature microservice runs
 * locally on port 8080 (`/api`); the published Docker image maps 21764.
 */
export const SANDBOX_API_BASE_URL = 'http://localhost:8080/api'

/**
 * Sphereon protects endpoints with OAuth2 / OpenID scopes. The read scopes
 * cover listing and reading signature configurations and certificates.
 */
export const DEFAULT_SCOPES: string[] = ['read:vdx_sign_config', 'read:vdx_sign_cert']

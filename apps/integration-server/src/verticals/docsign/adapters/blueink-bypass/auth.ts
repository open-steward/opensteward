/**
 * Sphereon eIDAS Signature auth helpers.
 *
 * The Sphereon VDX cloud gateway is reached with a bearer API token
 * (`Authorization: Bearer <token>`) — minted from the customer's IAM /
 * OpenID solution and pasted into the Connect Link form. There is no
 * interactive OAuth redirect flow in this adapter, so `getAuthUrl()` throws
 * and credentials are collected via `credentialFields()`.
 */
import type { Credentials } from '@opensteward/shared'
import { simpleApiKey } from '@opensteward/shared'

export const SPHEREON_CREDENTIAL_FORM = simpleApiKey({
  fieldName: 'apiKey',
  label: 'API token',
  helpText:
    'Bearer token for the Sphereon VDX eIDAS Signature gateway, minted from ' +
    'your OpenID/OAuth2 IAM with the read:vdx_sign_config and ' +
    'read:vdx_sign_cert scopes. Treat as a secret.',
})

export async function refreshSphereonCredentials(
  credentials: Credentials,
): Promise<Credentials> {
  return credentials
}

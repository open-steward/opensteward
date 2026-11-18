/**
 * ComsignTrust WeSign auth helpers.
 *
 * WeSign publishes its v3 OpenAPI at
 * https://wse.comsigntrust.com/api/swagger/v3/swagger.json. Its only security
 * scheme is `Bearer`: "JWT Authorization header using the Bearer scheme.
 * Example: \"Authorization: Bearer {token}\"". The client sends the token
 * collected here that way.
 *
 * The JWT comes from `POST /v3/Users/login` ("User login case the company
 * force OTP will return token for OTP", body `LoginRequestDTO {email,
 * password}`, response `UserTokensResponseDTO {token, refreshToken, ...}`)
 * and can be renewed through `POST /v3/Users/refresh` ("Refresh token").
 * This adapter collects a pasted JWT only and calls neither, so the
 * connection stops working when that JWT expires (known gap, not yet built).
 *
 * There is no interactive OAuth flow — getAuthUrl() throws and credentials
 * are collected via the Connect Link credentialFields() form.
 */
import type { Credentials } from '@opensteward/shared'
import { customForm } from '@opensteward/shared'

export const COMSIGNTRUST_CREDENTIAL_FORM = customForm({
  fields: [
    {
      name: 'apiToken',
      label: 'API token (JWT)',
      type: 'password',
      helpText:
        'WeSign JWT, sent as "Authorization: Bearer <token>". WeSign issues it from POST /v3/Users/login; it expires, and this connection does not refresh it.',
      required: true,
    },
  ],
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const apiToken = (fields.apiToken ?? '').trim()
    if (!apiToken) throw new Error('ComsignTrust WeSign API token is required.')
    return {
      accessToken: apiToken,
    }
  },
})

export async function refreshComsigntrustCredentials(
  credentials: Credentials,
): Promise<Credentials> {
  // Not implemented: POST /v3/Users/refresh takes a TokensDTO with the
  // refreshToken, which a pasted JWT does not come with.
  return credentials
}

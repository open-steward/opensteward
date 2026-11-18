/**
 * Ko-fi auth helpers.
 *
 * Ko-fi uses a static verification token rather than OAuth2. Creators paste
 * their verification token into the Ko-fi dashboard webhook settings. Incoming
 * webhook payloads include the same token in the `verification_token` field —
 * the adapter compares it to `credentials.accessToken` to confirm authenticity.
 *
 * There is no authorization URL, no code exchange, and no token refresh.
 *
 * Credentials layout:
 *  - `accessToken`    Ko-fi verification token (static, set in Ko-fi dashboard)
 *  - `extra.pageId`   Ko-fi page identifier (e.g. "yourusername")
 *
 * Docs: https://ko-fi.com/manage/webhooks
 */

import type { KofiWebhookPayload } from './transform/order'

/**
 * Verify an incoming Ko-fi webhook by comparing the embedded
 * `verification_token` to the stored access token.
 *
 * Ko-fi does not use HMAC signatures — it embeds the raw token in the
 * JSON payload. Both sides must match exactly.
 */
export function verifyKofiWebhook(
  payload: KofiWebhookPayload,
  verificationToken: string,
): boolean {
  return (
    typeof payload.verification_token === 'string' &&
    payload.verification_token === verificationToken
  )
}

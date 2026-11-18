# CloudSign adapter

CloudSign (GMO Cloud, Japan) REST API → canonical docsign schema.

Spec: [Web API 0.37.0](https://api.swaggerhub.com/apis/CloudSign/cloudsign-web_api/0.37.0). Usage guide: <https://help.cloudsign.jp/ja/articles/2681259>.

## Auth

Not OAuth. Each connection supplies a CloudSign **client ID** (issued under 管理画面 > アカウント > クライアントID, <https://www.cloudsign.jp/api/clients>) through the Connect form. The adapter exchanges it at `POST https://api.cloudsign.jp/token` (form-encoded, single field `client_id`) for an access token valid for `expires_in` seconds (one hour), sent as `Authorization: Bearer <token>`. The client ID is kept on the connection and re-exchanged when the token expires. There is no refresh token, client secret or redirect URI. Production host only (`api.cloudsign.jp`).

If the re-exchange gets a 400 (`invalid_request` or `invalid_client`) or a 403 (`forbidden`: the client ID belongs to an invalid user, or an IP restriction), or the connection holds no client ID at all, the refresh fails as `invalid_grant`. The connection is marked `expired` and must reconnect. It is not reported as the operator-wide `platform_error`, because the client ID belongs to the connection. A 500 or a network error stays retryable.

## Webhooks

HMAC-SHA256 in `X-CloudSign-Signature` (hex).

## Refused fields

- Document content
- Signature images

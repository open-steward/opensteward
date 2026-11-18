# Flowmono adapter

Flowmono eSign API → canonical docsign schema.

## Onboarding

1. Create a Flowmono account at [flowmono.com](https://www.flowmono.com).
2. Open **Settings → API** and create an application to obtain your credentials.
3. Note the **Bearer token**, **App ID**, **API Client ID**, **Subscriber ID**, and **User ID**.

Set in `.env` of the integration-server or enter via the Connect Link credential form:

```
FLOWMONO_TOKEN=...
FLOWMONO_APP_ID=...
FLOWMONO_API_CLIENT_ID=...
FLOWMONO_SUBSCRIBER_ID=...
FLOWMONO_USER_ID=...
```

## Authentication

Flowmono does not use OAuth Authorization-Code Grant for server-to-server integrations.
Requests are authenticated with a static Bearer token in the `Authorization` header.
The adapter collects all required credential fields via the Connect Link credential form.

## API base

All requests go to `https://api.flowmono.com`. The public Swagger spec is available at
`https://api.flowmono.com/swagger/v1/swagger.json`.

## Webhooks

Flowmono registers a webhook URL via `POST /api/WebHook/createwebhookurl`. The platform
does not currently sign deliveries with an HMAC secret; the adapter's `verifyWebhook`
always returns `true`. Restrict the webhook endpoint to Flowmono's IP ranges or use mTLS
for production deployments.

## Unsupported operations

- **Templates** — Flowmono does not expose a templates list/get endpoint in the current
  public API. `listTemplates` / `getTemplate` are not implemented; callers receive a 501.
- **voidEnvelope** — No void/cancel endpoint is available in the public API; the method
  returns the current signing-request state.
- **Document content** — Binary document bytes are never fetched; only metadata is surfaced.

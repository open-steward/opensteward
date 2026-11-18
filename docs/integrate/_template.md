---
# Replace every placeholder below before committing. `check:guides` fails CI
# if any required key is missing, the platform slug doesn't resolve, or
# last_verified is malformed.
vertical: ecommerce              # REQUIRED. Must match the directory this file sits in.
                                 # accounting | crm | customer-support | docsign | ecommerce | inventory | logistics | payments | projects
platform: <adapter-slug>         # REQUIRED. Must match a row in docs/openapi/platform-slugs.json
title: Integrating <Platform>    # REQUIRED
auth_type: oauth2                # REQUIRED. oauth2 | oauth2_cc | api_key | session | local
estimated_time: 20min            # REQUIRED. Rough end-to-end estimate.
last_verified: YYYY-MM-DD        # REQUIRED. Date the author last walked through this on the real dev portal.
partner_program: false           # optional. true if registering for production needs partner review;
                                 # true also pins the coverage pill to "Partner only".
written_by: <handle>             # optional
---

<!--
  Walkthrough v2 schema. Two required H2s:
    ## Walkthrough              — numbered steps, one screenshot per step
    ## Platform-specific notes  — anything that differs from a generic OAuth flow

  Optional H2s that the validator allows:
    ## Webhooks                  — only if the platform sends webhooks
    ## Troubleshooting           — error string → cause → fix

  Screenshots:
    Store under `docs/assets/screenshots/integrate/<vertical>/<platform>/`.
    Name them `01-…`, `02-…` so directory listings sort correctly.
    Embed via `![alt](/assets/screenshots/integrate/<vertical>/<platform>/<name>.png)`.

  If a guide has nothing platform-specific to say beyond a generic OAuth
  flow, it shouldn't exist — the `/platforms/<vertical>/<platform>` config
  page already covers that. Only author a guide when you have real
  per-platform content (screenshots of the dev portal, scope quirks,
  sandbox vs production hosts, subdomain handling, partner-program gating,
  multi-auth, webhook signature scheme, etc.).
-->

# Integrating <Platform>

<One or two sentences. State what the operator is about to do and roughly
how long it takes. No marketing — describe.>

## Walkthrough

1. **Open the developer portal.** Lead each step with the verb, name the
   exact UI label, and follow with one screenshot.

   ![Create app screen](/assets/screenshots/integrate/<vertical>/<platform>/01-create-app.png)

2. **Configure the callback URL.** Paste the OpenSteward redirect:

   `<your-deployment-url>/auth/<vertical>/<platform>/callback`

   Local dev: `http://localhost:3010/auth/<vertical>/<platform>/callback`

   ![Callback configuration](/assets/screenshots/integrate/<vertical>/<platform>/02-callback.png)

3. **Pick scopes** matching the adapter's `recommendedScopes` metadata.
   If the adapter also declares `readScopes`, the dev-portal app has to be
   able to grant those too — a Connect Link requests them by default
   (`scopePolicy: read_only`), and an app that cannot issue them fails at
   authorize with `invalid_scope`.

   ![Scope selection](/assets/screenshots/integrate/<vertical>/<platform>/03-scopes.png)

4. **Copy the Client ID and Secret into OpenSteward.**

   [Configure <Platform> in OpenSteward](/platforms/<vertical>/<platform>){.xlink}

   ![Credentials saved](/assets/screenshots/integrate/<vertical>/<platform>/04-saved.png)

## Platform-specific notes

Bullet anything an operator wouldn't guess from a generic OAuth flow.
Delete bullets that don't apply; add new ones if the platform has quirks
not listed.

- **Sandbox vs production:** <which host, how to switch, whether credentials are separate>
- **Subdomain handling:** <does the operator/customer enter a workspace slug? where is it stored?>
- **Refresh tokens:** <issued? rotated? long-lived secret instead?>
- **Scope quirks:** <minimum-set traps, scope-on-install vs scope-on-token, scope deprecations>
- **Partner program:** <required for production? review SLA? what to submit?>
- **Rate limits:** <numbers worth knowing, headers used, retry behaviour>
- **Webhook signature:** <header name, algorithm, secret source — only mention if non-standard>

## Webhooks

<Only include this section if the platform actually sends webhooks. Otherwise
delete the heading. Describe the signature scheme and what the operator
configures in the dev portal, then point at the OpenSteward gateway URL.>

> **Webhook endpoint**: `<your-deployment-url>/webhooks/<vertical>/<platform>`

## Troubleshooting

<Optional. Each H3 below becomes one card. Lead the H3 with the exact error
string OpenSteward surfaces in backticks.>

### `error_string_one`

What's wrong. Plain English.

**Fix:** what to do.

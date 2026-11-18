# Setting up SSO & corporate identity for the admin console

This guide walks an operator through connecting a corporate identity provider
(IdP) to the OpenSteward **admin console** so staff sign in with their company
account instead of a local password. It covers OIDC/OAuth2, SAML 2.0, LDAP /
Active Directory, SCIM provisioning, role mapping, and the break-glass account.

- Conceptual design: [../architecture/sso-and-identity-providers.md](../architecture/sso-and-identity-providers.md)
- Env var reference: [../environment/environment-variables.md](../environment/environment-variables.md)

> Only **admin-role** users can configure providers, at **Admin → SSO &
> identity** (`/identity-providers`). This affects who can log into the admin
> UI — it does not change developer API keys, end-users, or connections.

## 1. Prerequisites (env)

Set these on the services before configuring a provider (see
`docker-compose.yml` / your deployment):

| Variable | Service | Why |
|---|---|---|
| `STORE_SECRET` | admin-api | **Required.** Encrypts provider secrets at rest (≥ 32 random chars). Reuse the integration-server value. |
| `SSO_PUBLIC_BASE_URL` | admin-api **and** admin | Public, browser-/IdP-reachable URL of admin-api (e.g. `https://admin-api.acme.com`). IdP callbacks, SCIM, and the UI's "Sign in with…" links all use it. |
| `ADMIN_UI_URL` | admin-api | Public URL of the admin UI (e.g. `https://admin.acme.com`) for the post-login handoff. |

In production (`NODE_ENV=production`) a missing/weak `STORE_SECRET` is a
hard boot error. Behind a TLS-terminating proxy, set these to the **public
https** URLs, not the in-cluster service names. Set them as **env vars** — env values
take precedence over any `sso:` block in a mounted
`apps/admin-api/config/config.yml`, which serves as the local-dev fallback.

**This is the one reason to publish any part of admin-api.** It is otherwise
internal-only (see [`../security/README.md`](../security/README.md) §2). The
IdP and the operator's browser have to reach `/api/sso/{slug}/login`,
`/api/sso/{slug}/callback`, `/api/sso/{slug}/acs` and `/scim/v2/*` on
`SSO_PUBLIC_BASE_URL` — publish *those path prefixes only* through the reverse
proxy, never the whole service.

> **On Kubernetes?** Set `ingress.sso` in the Helm chart: it renders an Ingress for
> exactly these paths plus a NetworkPolicy for admin-api. See
> [`deploy/helm/opensteward/README.md`](../../deploy/helm/opensteward/README.md).

The URLs your IdP will need (replace the base with your `SSO_PUBLIC_BASE_URL`):

- OIDC redirect URI: `{SSO_PUBLIC_BASE_URL}/api/sso/<slug>/callback`
- SAML ACS (Assertion Consumer Service): `{SSO_PUBLIC_BASE_URL}/api/sso/<slug>/acs`
- SCIM base URL: `{SSO_PUBLIC_BASE_URL}/scim/v2`

`<slug>` is the provider slug you choose in step 2 (lowercase, e.g. `okta-prod`).

## 2. Add a provider

**Admin → SSO & identity → Add provider.** Choose a name, a slug, and the
protocol. Fill in the protocol fields below, set a **default role** (applied
when no role-mapping rule matches), leave **JIT provisioning** on to
auto-create users on first login, and tick **Enabled** when ready to expose it
on the login page. Secrets are write-only — the form shows "set — leave blank
to keep" on later edits.

### OIDC / OAuth2 (Okta, Entra/Azure AD, Google, Auth0, Keycloak, …)

1. In your IdP, create an **OIDC web application** (Authorization Code flow).
2. Add the redirect URI `{SSO_PUBLIC_BASE_URL}/api/sso/<slug>/callback`.
3. Copy the **Issuer** URL, **Client ID**, and **Client secret** into the form.
   - Issuer examples: Okta `https://acme.okta.com`, Entra
     `https://login.microsoftonline.com/<tenant-id>/v2.0`, Google
     `https://accounts.google.com`.
4. **Scopes** default to `openid profile email`. To drive role mapping from
   groups, ensure the IdP returns a groups claim and set **Groups claim** to its
   name (Okta `groups`, Entra `groups` or `roles` — you may need to add a
   groups claim to the token in the IdP).

OpenSteward always uses Authorization Code + PKCE and validates state, nonce,
and the ID-token signature/issuer/audience/expiry.

**Email and picture.** The `email` scope's `email` claim becomes the user's
email in the console, unless the IdP says `email_verified: false` — then it is
ignored. The `profile` scope's `picture` claim (an https URL) becomes their
profile picture. Both are refreshed at every sign-in, and neither ever
replaces an email an admin typed or a picture someone uploaded. Nothing to
configure beyond keeping `email` and `profile` in **Scopes**. Google sends
`picture` by default; Keycloak sends it when the user has a `picture`
attribute; in Okta add a `picture` claim if you want one. Entra ID's `picture`
points at Microsoft Graph and needs a token, so it will not load — upload
pictures instead, or provision them over SCIM.

### SAML 2.0

1. In your IdP, create a **SAML app**. Set the **ACS URL** to
   `{SSO_PUBLIC_BASE_URL}/api/sso/<slug>/acs` and the **Audience / SP
   entityID** to a value you choose (put the same value in **SP entityID**).
2. Configure the IdP to **sign assertions** (and the response). Copy its
   **signing certificate** (PEM) into **IdP signing certificate**.
3. Put the IdP **SSO URL** in **entryPoint** and its **issuer/entityID** in
   **IdP issuer**.
4. Map an attribute carrying group membership and set **Groups attribute**
   accordingly; set **Email attribute** to the attribute holding email. When
   that attribute is absent, `email`, `mail`, the Entra/ADFS
   `…/claims/emailaddress` claim and an email-format NameID are tried in turn.
5. *(Optional)* To source profile pictures, send an attribute holding an
   **https URL** of the user's picture and name it in **Picture attribute**
   (left empty, `picture`, `photo`, `photoUrl` and `avatar` are tried). SAML
   has no "verified" flag — the signed assertion is trusted as is.

After saving you can fetch SP metadata at
`{SSO_PUBLIC_BASE_URL}/api/identity-providers/<id>/metadata` (admin-authed) to
import into the IdP. Validation enforces signed assertions, audience/recipient,
NotOnOrAfter, InResponseTo, and assertion-ID replay protection.

### LDAP / Active Directory

1. Provide an **LDAP URL** — use `ldaps://host:636` (TLS is **required** in
   production).
2. Provide a **service-account Bind DN** + **Bind password** used to search.
3. Set the **Search base** (e.g. `ou=people,dc=acme,dc=com`) and **Search
   filter** with `{{username}}` (e.g. `(uid={{username}})`; for AD,
   `(sAMAccountName={{username}})`).
4. Set **Groups / Email / Display-name attributes** (AD commonly `memberOf` /
   `mail` / `cn`).

LDAP login shows a username/password form on the OpenSteward login page (no
browser redirect). Credentials are verified by re-binding as the user;
usernames are escaped per RFC 4515 before searching.

## 3. Role mapping

On the provider's page, add rules mapping IdP groups/claims to OpenSteward
roles (`admin` / `operator` / `viewer`). Rules are evaluated by **ascending
priority; first match wins**, otherwise the **default role** applies. Mapping
is re-applied on **every login**, so removing someone from a group in the IdP
demotes them on their next sign-in.

- **Claim/attribute**: the path to read (e.g. `groups`, or dotted like
  `realm.roles`).
- **Match**: `equals`, `contains`, or `regex`.
- Example: claim `groups` `equals` `OpenSteward-Admins` → role `admin`.
- **Custom roles**: the role picker also lists the custom roles defined under
  **Admin → Roles** (a base role plus a chosen set of permissions — see
  [permissions-and-roles](../architecture/permissions-and-roles.md)). A rule
  can grant one; you can only pick a role whose permissions you hold yourself,
  and a role named by a rule cannot be deleted until the rule is removed.

### Tenant scope from IdP groups

A provider created before tenant scoping existed lets every SSO user see every
tenant. A provider created since then grants **no tenants** until you set its
default scope or add **scope rules** on the provider's page (admin role plus
the `users:manage` permission):

- Same claim / match fields as role rules, plus the **tenants** to grant
  (comma-separated ids, or `*` for every tenant) and optionally the
  **verticals** within them (empty = all).
- **Every** matching scope rule applies and the tenants are combined — someone
  in both `acme-support` and `globex-support` sees both tenants.
- When no scope rule matches, the provider's **default scope** applies: every
  tenant, or only the tenants ticked there — none ticked means
  the user sees no tenant data until a rule matches.
- Scope is re-applied on every login and SCIM group change, for users whose
  scope the IdP owns (every JIT/SCIM user). If an admin sets a user's scope by
  hand on the user page, the IdP stops overwriting it; tick "Let the identity
  provider's scope rules manage this" there to hand it back.

Scope rules only narrow non-admins: a group mapped to an admin role gives
those users every tenant, whatever the scope rules say. For per-tenant
administrators, map the group to a custom role (base `operator`, plus
`users:manage`) and scope it.

A restricted user sees only its tenants' connections, sync jobs and tenants,
and is refused (`SCOPE_RESTRICTED`) on pages that are not tenant-scoped yet
(customers, Connect Links, API keys, webhooks, OAuth clients, audit log),
and on deployment-wide settings (platform config, scope groups, role writes,
dashboard-task dismissals, notification acknowledgement).

## 4. SCIM provisioning (optional)

To let the IdP push user/group create/update/deactivate ahead of login, mint a
**SCIM token** on the provider page (shown once — copy it). In the IdP's
provisioning settings:

- **SCIM base URL**: `{SSO_PUBLIC_BASE_URL}/scim/v2`
- **Bearer token**: the minted token.

Supported: Users (create / replace / PATCH `active`, `emails`, `photos` /
delete) and Groups (membership PATCH). Group membership feeds the same
role-mapping rules. A user's `emails` (the primary one, else the first) and
`photos` (a `photo`, else a `thumbnail`) set their console email and picture,
with the same precedence as sign-in: an admin's email and an uploaded picture
are kept.
Deactivation/deletion is refused if it would remove the last local admin (see
below). Revoke or rotate tokens any time from the same page.

## 5. Local login & the break-glass admin

Local username/password login stays on by default. Once SSO works you can turn
it off at **Admin → Settings** (`auth.local_login_enabled`). One **break-glass**
local admin is always preserved and can sign in with a password even when local
login is disabled — it's auto-pinned to the first-run admin
(`auth.break_glass_user_id`). OpenSteward refuses any action (disabling local
login, deleting/deactivating, or role demotion) that would leave **zero**
password-usable local admins. Keep that account's credentials safe; it's your
recovery path if the IdP is unreachable.

## 6. Verify

1. Open the admin login page in a fresh browser session — you should see a
   "Sign in with <provider>" button (or the LDAP form).
2. Sign in through the IdP; you should land on the Status page with the mapped
   role. A new user is auto-created (JIT) on first login.
3. Check **Admin → Audit log** for `sso.login` — its detail records the
   resulting `role`, plus `roleChanged: true` when a role-mapping rule changed
   the user's role on that login (OIDC/SAML logins only; the LDAP path omits
   the flag).
4. If SCIM is configured, trigger a sync from the IdP and confirm users appear
   under **Admin → Users**.

No identity provider to hand? [operations/sso-testing.md](../operations/sso-testing.md)
runs the whole flow above against a mock OpenID Provider on your machine, personas
and role mapping included.

## Troubleshooting

- **"Failed to start SSO login" / 502** — bad issuer/entryPoint or the IdP is
  unreachable from admin-api; check `SSO_PUBLIC_BASE_URL` and network egress.
- **Redirect/callback mismatch** — the redirect URI / ACS URL registered at the
  IdP must exactly equal `{SSO_PUBLIC_BASE_URL}/api/sso/<slug>/callback|acs`.
- **"Invalid or expired login state"** — the round-trip took longer than ~10 min
  or cookies/clock skew; retry. SAML clock skew tolerance is ±5s.
- **Everyone lands as `viewer`** — no role-mapping rule matched; check the
  groups claim/attribute name and that the IdP actually emits it.
- **Can't disable local login (409)** — you'd orphan the last local admin;
  ensure a break-glass admin exists first.
- **The IdP's email never shows up** — an admin set one (it wins; clear it on
  the user page to hand it back), or the OIDC IdP sends
  `email_verified: false`.
- **The IdP's picture never shows up** — someone uploaded one (it wins; remove
  it to let the IdP's return), or the fetch was refused. admin-api logs
  `idp avatar not fetched` at `info` with the host and a reason: `not_https`,
  `blocked_address` (the host resolves to a private, loopback, link-local or
  multicast address), `redirect` (redirects are not followed), `http_status`
  (e.g. the URL needs a token, as Microsoft Graph does), `timeout` (5 s),
  `too_large` (512 KB), `not_image` (not PNG, JPEG or WebP) or `dns` (no A/AAAA
  answer; admin-api resolves through the system nameservers, not `/etc/hosts`).
  At most four pictures are fetched at once; past that a fetch is skipped (logged
  at `debug`) and retried at the user's next sign-in. admin-api needs outbound
  https to the picture host, directly — an `HTTPS_PROXY` is not used for it.

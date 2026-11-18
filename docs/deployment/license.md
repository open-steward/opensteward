# Installing and renewing your license

This page is for operators: how to install your OpenSteward license, renew it and check it, and
what happens when it is missing, invalid or expired. A license problem never stops OpenSteward:
without a valid license it runs in community mode.

## What the license is

- A signed text file: a PASETO `v4.public` token signed with Ed25519. You download it named after
  its label (`<label>-license.key`) and install it as `license.key`.
  integration-server verifies it **offline**, against public keys built into each release.
  OpenSteward never phones home, so an air-gapped install works like any other.
- It names who it is issued to (shown on the System page and in the startup log), an optional
  `label` for the install, an expiry date, and what it enables: verticals, MCP, and limits on
  connections and tenants.
- The token is never logged, shown in the console or returned by any API. Keep it private
  anyway: it is your license.
- Only **integration-server** reads it. admin-api and the admin console ask integration-server
  and show its answer.

## Getting a license

Get one at <https://opensteward.dev/license>, which lists the current plans and their limits; a
free license is available. Use one license per install, and give each a label there (for example
`production`, `staging`) so the console and the logs tell them apart. How license files relate to
the license terms is in [`COMMERCIAL-LICENSE.md`](../../COMMERCIAL-LICENSE.md#license-files).

## Where integration-server looks

The first match wins:

1. **`OPENSTEWARD_LICENSE`**: the token itself. Changing it needs a restart of integration-server.
   While it is set, the license file is ignored: a renewal written to the file has no effect, and
   the startup log, `pnpm run doctor` and the System page's License card say so, naming the file.
   An empty value counts as unset, so a blank `OPENSTEWARD_LICENSE=` line in `.env` is harmless.
2. **`OPENSTEWARD_LICENSE_FILE`**: the path of the license file, never the token itself. An empty
   value counts as unset.
3. **`license.key` next to `STORE_PATH`**: `apps/integration-server/data/license.key` when you run
   from source.

Docker Compose sets `OPENSTEWARD_LICENSE_FILE=/etc/opensteward/license/license.key` and mounts the
`opensteward-license/` folder there; the Helm chart does the same when `license.existingSecret` is
set. Both variables are described under [Licensing](../environment/environment-variables.md#licensing)
in the environment variable reference.

## Docker Compose

`docker-compose.yml` mounts the `opensteward-license/` folder next to it at
`/etc/opensteward/license`, read-only and as a **directory**, on integration-server only, and
passes `OPENSTEWARD_LICENSE` and `OPENSTEWARD_LICENSE_FILE` to integration-server only.
`OPENSTEWARD_LICENSE_FILE` defaults to `/etc/opensteward/license/license.key`. To install a
license, from the folder that holds `docker-compose.yml`:

```bash
mkdir -p opensteward-license
cp /path/to/<label>-license.key opensteward-license/license.key
chmod 755 opensteward-license && chmod 644 opensteward-license/license.key
docker compose up -d
```

Create the folder **before** the first `docker compose up`. Otherwise Docker creates it empty and
owned by root, and integration-server runs in community mode until you add the file. The `chmod`
is there because the containers run as uid 1000 (see [File permissions](#file-permissions)). The
folder is not called `license/` because on macOS and Windows, where file names ignore case, that
name is the repository's `LICENSE` file.

- **Renewing:** replace the **file**, in the same folder and with the same name; never replace the
  folder. On Linux the new license applies at once. On Docker Desktop (macOS, Windows) a bind mount
  does not reliably report changes, so it applies within the hourly re-check;
  `docker compose restart integration-server` applies it at once anywhere.
- **Another folder:** the license block in `docker-compose.override.example.yml` mounts a different
  host folder, for example `/srv/opensteward/license`, at the same container path, which replaces
  the default mount. Mount a folder, never the file: a single-file bind mount keeps pointing at the
  original file, so a renewed license would never reach the container.
- **`OPENSTEWARD_LICENSE` in `.env`** wins over the file and needs
  `docker compose up -d integration-server` after every change. While it is set, a renewed
  `opensteward-license/license.key` is ignored, and the startup log warns that the file is
  shadowed. An empty value counts as unset.
- A `license.key` copied into integration-server's data volume is never read with the default
  `OPENSTEWARD_LICENSE_FILE`: use the `opensteward-license/` folder.
- `opensteward-license/` and `license.key` are in `.gitignore` and `.dockerignore`, so a license
  never ends up in git or in an image.
- `pnpm backup` does not include `opensteward-license/license.key`. Keep your own copy of the file
  (you can also download it again).
- Published images use the default `production` build profile and never trust development keys;
  the release workflow rejects any image that still carries them. The `development` build profile
  in the override example is for maintainers' local stacks only (see
  [Development licenses](#development-licenses)).

## Kubernetes (Helm)

Keep the license in a Kubernetes Secret and point the chart at it:

```bash
kubectl create secret generic opensteward-license --from-file=license.key=./<label>-license.key
helm upgrade <release> <chart> --reuse-values --set license.existingSecret=opensteward-license
```

On a new install, pass `--set license.existingSecret=opensteward-license` (or set it in your values
file) to `helm install` instead.

- `license.existingSecret` names the Secret. Its default, `""`, mounts nothing, and
  integration-server runs in community mode. `license.secretKey` names the key inside the Secret
  (default `license.key`); set it when your secret tooling names the key differently.
- The chart mounts the Secret read-only, **as a directory**, at `/etc/opensteward/license`, on
  integration-server only, and sets `OPENSTEWARD_LICENSE_FILE=/etc/opensteward/license/license.key`.
  It never uses `subPath`: the kubelet never updates a `subPath` mount, so a renewed Secret would not
  reach the pod. integration-server notices the kubelet's update and reloads the license without a
  restart.
- The volume is `optional`: a missing Secret or key leaves the pod running, in community mode. If
  you create the Secret after installing, run
  `kubectl rollout restart deploy/<release>-opensteward-integration-server` once; renewals need no
  restart.
- The Secret is mounted with mode 0440 (`defaultMode: 288`), readable by the pod's group, so no
  permission step is needed.
- **Renewing:** update the Secret in place:
  `kubectl create secret generic opensteward-license --from-file=license.key=./<label>-license.key --dry-run=client -o yaml | kubectl apply -f -`.
  The kubelet syncs it within about a minute, so replicas can disagree about the license for that
  minute. Connection counts are shared through the database, and a write refused for the connection
  limit is always re-checked against it first, so a connection deleted through one replica frees
  its slot on every replica at once.
- The console's License card needs `ADMIN_SECRET` (`secrets.generate.includeAdminSecret=true`,
  `secrets.plain.adminSecret`, or your own Secret). Without it, `GET /api/license` answers
  `503 LICENSE_STATUS_UNAVAILABLE` naming `ADMIN_SECRET`, and creating a tenant falls back to the
  community limit.
- **Marketplace installs** (AWS, Azure, GCP): how you set `license.existingSecret` depends on who
  owns the Helm release. On AWS, the values file at install, or `helm upgrade` later. On Azure, the
  form's **License** step at install, or the extension's configuration settings later (never a
  hand-run `helm upgrade`, which the extension's next update can undo). On GCP, the deploy form's
  **License secret** field, and only there: the deployer leaves no Helm release to upgrade, so name
  the Secret at deploy time even if you create it later. See
  [the license on a marketplace install](../../deploy/marketplace/README.md#the-opensteward-license-on-a-marketplace-install)
  for the commands.

The chart README's [License](../../deploy/helm/opensteward/README.md#license) section has the same
values in table form.

## Running from source

With `pnpm dev:integration-server` (or `pnpm --filter integration-server run dev`), put the file at
`apps/integration-server/data/license.key` (next to `STORE_PATH`), point `OPENSTEWARD_LICENSE_FILE`
at it, or set `OPENSTEWARD_LICENSE`. A relative `OPENSTEWARD_LICENSE_FILE` is resolved from
`apps/integration-server`.

## File permissions

The containers run as uid 1000 (`node`). The license file must be readable by that user and its
directory searchable: `chmod 755 opensteward-license && chmod 644 opensteward-license/license.key`
covers a Linux host where your own user is not uid 1000. If it is not readable, the state is
`INVALID (FILE_UNREADABLE)` and the log names the path and says it must be readable by uid 1000.
On a Linux host, `pnpm run doctor` checks this for the folder compose mounts (the
`license: permissions` row). It does not on macOS or Windows, where Docker Desktop gives the
container your own user's access to a bind mount, so the file's mode bits do not decide it. Helm
mounts the Secret with mode 0440 for the pod's group, so nothing is needed there.

## Checking it

- **System page** (admins only: **System** in the sidebar): the License card shows who the license
  is issued to, the plan, label, license ID, expiry and days left, connections and tenants used
  against the limits, the enabled verticals and where it was read from, with an alert when
  something needs attention. Admins also see that alert at the top of every console page.
- **`os license get`**, or `GET /api/license` on admin-api with an admin's token.
- **integration-server's startup log**: one line with the state, organisation, plan, label, expiry
  and days left. Never the token.
- **`pnpm run doctor`** (or `os doctor`) finds the license the way integration-server does and
  reports it without writing anything. It never reports `FAIL` for the license:
  - `license: state`: `PASS` for a valid license signed with a production key, otherwise `WARN`
    with the state, the reason and what to do;
  - `license: source` (`WARN`): `OPENSTEWARD_LICENSE` is set, so the license file is ignored;
  - `license: permissions` (`WARN`, Linux hosts only): uid 1000 cannot open the mounted folder or
    file, with the `chmod` that fixes it;
  - `license: file` (`INFO`): `./opensteward-license/license.key` exists, but nothing points
    integration-server at it;
  - `license: source run` (`INFO`): `docker-compose.yml` points at its mount, but a run from source
    would read the `license.key` next to `STORE_PATH`.

  For the compose container path, doctor reads the host folder mounted at
  `/etc/opensteward/license`: `docker-compose.override.yml`'s mount first, then
  `docker-compose.yml`'s, then `./opensteward-license/`. It cannot read a named volume there, or a
  source that uses a variable (`${LICENSE_DIR:-./custom}`), and says so.
- `GET /admin/license` on integration-server with `X-Admin-Secret`, which is what admin-api reads.

admin-api reads the license from integration-server using `ADMIN_SECRET`. Without it (the Helm
default is `secrets.generate.includeAdminSecret: false`, and the marketplace listings make it
optional) the License card says the status is unavailable and names `ADMIN_SECRET`, no banner
appears, and creating a tenant falls back to the community limit of one. Set the same
`ADMIN_SECRET` on integration-server and admin-api.

## States

| State | When | What works | What you see |
|---|---|---|---|
| `VALID` | A good license with more than 30 days left | Everything it enables | The License card; no alert |
| `EXPIRING` | The last 30 days before expiry | Everything it enables | A warning with the expiry date |
| `GRACE` | Up to 30 days after expiry | Still everything it enables | A red alert with the date grace ends |
| `DEGRADED` | More than 30 days after expiry | Community mode | A red alert: renew |
| `INVALID` | The license is damaged, unreadable, revoked or not trusted ([reasons](#why-a-license-is-invalid)) | Community mode | A red alert with the reason |
| `MISSING` | No license found | Community mode | A warning: get a free license |

A license issued for 30 days or less, such as a provisional license while an invoice is being
paid, shows `EXPIRING` from the start. The license service replaces it when it is renewed.

integration-server re-checks the license every hour, so `EXPIRING`, `GRACE` and `DEGRADED` begin
within an hour of their time. A changed license file is picked up within about a second (within
the hour where file changes are not reported, as on Docker Desktop).

## Community mode

Without a valid license (`MISSING`, `INVALID`, `DEGRADED`), OpenSteward runs in community mode:

- MCP and every current vertical;
- 1 connection and 1 tenant (counting `default`).

If more connections exist than the limit allows (a license that allowed more has lapsed, or a
restore brought them in), nothing is deleted:

- the oldest connections, up to the limit, keep working in full;
- the others stay readable and keep syncing (`POST /sync` included), but writes through them are
  refused with `403 LICENSE_LIMIT_EXCEEDED`, for `X-Admin-Secret` callers too;
- deleting connections until you are within the limit restores writes at once. A refused request
  is never stored under its `Idempotency-Key`, so a client retrying with the same key is checked
  again too.

New connections and tenants beyond the limit are refused with `LICENSE_LIMIT_EXCEEDED`.

**Never limited, in any state:** health checks, `/version`, the admin and configuration endpoints
(including exports of cached data under `/admin/data` and `GET /admin/license`), connection
management (rename, schedule, delete), `GET /v1/capabilities` and `GET /v1/me/capabilities` (a
credential carrying `mcp:read` is still refused there when the license does not include MCP; see
[What a license limits](#what-a-license-limits)), `GET /api/license`, incoming webhooks and the
docs.

## What a license limits

| Item | Where it is enforced | What you get |
|---|---|---|
| Verticals (`vertical:<name>`) | integration-server: every `/v1/<vertical>/…` route (also under `/v1/me` and `/test/v1`), new connections, scheduled syncs | `403 LICENSE_FEATURE_NOT_ENTITLED`; scheduled syncs skip the vertical |
| MCP (`mcp`) | integration-server, for every credential carrying `mcp:read` (`GET /v1/capabilities` included) | `403 LICENSE_FEATURE_NOT_ENTITLED`. MCP works only when both the license and the `features.mcp_enabled` setting allow it |
| Connections | integration-server, when a connection is created | `403 LICENSE_LIMIT_EXCEEDED` |
| Tenants | admin-api, `POST /api/tenants` | `403 LICENSE_LIMIT_EXCEEDED` |

- **Tenants** counts every registered tenant, `default` included. Community mode allows one, so
  adding a tenant needs a license that allows more. Tenant IDs used on keys or Connect Links
  without being registered are not counted.
- **MCP servers** read the enabled verticals once, when they start: `GET /v1/capabilities` with a
  tenant key, `GET /v1/me/capabilities` in end-user mode. Restart them after a license change so
  agents are offered the right tools.
- **Limits are counted, then enforced.** Two creates at the same moment (or on two replicas) can,
  rarely, both pass the count and leave one connection or tenant over the limit. Nothing breaks:
  a connection over the limit follows the rules in [Community mode](#community-mode), a tenant
  over it keeps working, and the next create is refused.
- **Unlimited.** A limit of 1,000,000 or more is shown as **Unlimited** on the System page (as on
  the license dashboard). `os license get` and `GET /api/license` still return the number.

## Reconnecting at the limit

Reconnecting a platform, for example after its OAuth grant expired, creates a new connection. At
the limit that is refused, and the message says to export, delete, then reconnect. Deleting a
connection also deletes its cached records, so:

1. Export what you need: **Export** on the **Data** page (CSV or NDJSON), or `os data records export`.
2. Delete the connection on the **Connections** page.
3. Connect again. The new connection syncs fresh from the platform.

## Renewing

Install the renewed license the way you installed the first one: replace the file in the mounted
directory, or update the Secret. integration-server picks it up without a restart. If you used
`OPENSTEWARD_LICENSE`, update it and restart integration-server. Then restart your MCP servers.

## The clock

integration-server records the latest time it has seen in its database (the `license_state`
table) and never lets the license clock run more than 24 hours behind it, so setting the clock
back does not extend a license. When the host clock is more than 24 hours behind that time, the
log says `CLOCK_ROLLBACK_DETECTED` and the System page notes it.

If the host clock was once set far in the future (a bad hardware clock or time server), licensing
keeps that future time, and a good license can read as `GRACE` or `DEGRADED`. To recover:

1. Fix the host clock.
2. Stop integration-server.
3. Delete the single row of `license_state` in its database: `DELETE FROM license_state;`
   (SQLite: `credentials.db` in integration-server's data directory; Postgres: integration-server's
   database).
4. Start integration-server.

## Error codes

Every license refusal is `{"error":{"code":"…","message":"…"}}`, sometimes with more fields:

| Code | HTTP | When |
|---|---|---|
| `LICENSE_FEATURE_NOT_ENTITLED` | 403 | A vertical or MCP the license does not include. For a vertical the body adds `feature` (for example `vertical:crm`); an MCP refusal has only `code` and `message`. Without a valid license the message points to <https://opensteward.dev/license>. |
| `LICENSE_EXPIRED` | 403 | A feature only the expired license enabled. In this release community mode includes every current vertical and MCP, so you will not see it yet. |
| `LICENSE_LIMIT_EXCEEDED` | 403 | The connection or tenant limit. The body adds `limitKey` (`connections` or `tenants`), `limit` and `used`, and `connectionId` when a write through a read-only connection is refused. |
| `LICENSE_STATUS_UNAVAILABLE` | 503 | admin-api's `GET /api/license` before integration-server has answered it once. The message names the cause, such as a missing `ADMIN_SECRET`. |

```json
{"error":{"code":"LICENSE_LIMIT_EXCEEDED","message":"…","limitKey":"connections","limit":1,"used":1}}
```

The unauthenticated OAuth start, `GET /auth/:vertical/:platform/connect`, and the OAuth callback
answer with the code and a short message only; the details go to integration-server's log. A
Connect Link customer sees a short message on their link page.

When a vertical refusal and the connection limit both apply, which one answers depends on the
request. A write through a read-only connection in a vertical the license does not include answers
`LICENSE_LIMIT_EXCEEDED`: the connection limit is checked first. Creating a connection in such a
vertical answers `LICENSE_FEATURE_NOT_ENTITLED`, even at the connection limit: the vertical is
checked first.

The Developer Guide lists the same refusals under
[License refusals](../dev-api.md#license-refusals).

## Why a license is INVALID

| Reason | What it means | What to do |
|---|---|---|
| `TOO_LARGE` | The token is longer than any license. | Check that you installed one license, not a file of several. |
| `NOT_PASETO_V4_PUBLIC` | Not an OpenSteward license token. | Install the file you downloaded (`<label>-license.key`) as `license.key`. |
| `MALFORMED` | The token's encoding is damaged (truncated, or broken by line breaks). | Download it again. |
| `FOOTER_INVALID` | The part naming the signing key is damaged. | Download it again. |
| `UNKNOWN_KID` | Signed with a key this build does not trust: a development license on a production image, or a key newer than this release. | Use a production license; upgrade OpenSteward. |
| `BAD_KEY` | This build has no usable key for that signer (a pre-release build). | Upgrade to a released version. |
| `BAD_SIGNATURE` | The token was changed after it was signed. | Download it again. |
| `PAYLOAD_NOT_JSON` | The token's contents are damaged. | Download it again. |
| `UNSUPPORTED_VERSION` | A newer license format than this release understands. | Upgrade OpenSteward. |
| `WRONG_ISSUER`, `WRONG_AUDIENCE` | Not issued by OpenSteward for this product. | Get a license at <https://opensteward.dev/license>. |
| `PAYLOAD_INVALID` | The contents do not match the license format this release knows. | Upgrade OpenSteward; contact support if it persists. |
| `NOT_YET_VALID` | Its start time is more than 5 minutes in the future. | Check the host clock. |
| `REVOKED` | The license is on the revocation list shipped with this release. | Contact support for a replacement. |
| `DEV_KEY_ENV_MISMATCH` | A development-key license that claims an environment other than `dev`. | Use a production license. |
| `FILE_UNREADABLE` | integration-server cannot read the file: permissions, a directory at that path, or a broken mount. Also a license token put in `OPENSTEWARD_LICENSE_FILE` instead of a path: it is never read as one, and the log says so without printing it. | See [File permissions](#file-permissions). A token goes in `OPENSTEWARD_LICENSE`, or in the file `OPENSTEWARD_LICENSE_FILE` names. |
| `FILE_TOO_LARGE` | The file is far larger than a license. | Check that you mounted the right file. |
| `FILE_EMPTY` | The file is empty or only whitespace. | Install the license again. |
| `EVALUATION_FAILED` | An internal error while checking the license; integration-server runs in community mode and logs the error. It also means the time recorded in `license_state` is corrupted (outside the range of a date): the log then says `CLOCK_ROLLBACK_DETECTED` and names the remedy. | For a corrupted `license_state`, fix the host clock and delete its row, as in [The clock](#the-clock). Otherwise, report it at <https://github.com/open-steward/opensteward/issues>. |

## Revoked licenses

Each release ships a signed list of revoked licenses; a revoked license reads `INVALID (REVOKED)`.
Air-gapped installs get a newer list by upgrading. If a build's list is missing or does not verify,
revoked licenses cannot be detected: the startup log says so and the System page notes it.
Everything else (the signature, the expiry, the features and limits) is still checked; only a
revoked license goes unnoticed.

## Development licenses

From a source checkout, `pnpm -s license:dev-token mint --org "Acme Dev AB"` prints a development
license. It is signed with a development key whose private half is public: it is in the
repository, so that anyone working on OpenSteward can try every license state locally without a
real license. That is also why it can never count in production:

- it always says `env: "dev"`, and the console and the log warn about it;
- only source builds trust development keys (and images a maintainer builds locally with
  `OPENSTEWARD_BUILD_PROFILE=development`, which log that they trust them). Published images are
  built without them, so a production image reads a development license as
  `INVALID (UNKNOWN_KID)`;
- a development-key license that claims any other environment is `INVALID (DEV_KEY_ENV_MISMATCH)`.

## License terms

integration-server and the other server-side services are released under the
[Elastic License 2.0, with an Additional Use Grant](../../LICENSE) (the SDK, the CLI and the MCP
server are Apache-2.0; see Scope in `LICENSE`). The license checks are its "license key
functionality":

> You may not move, change, disable, or circumvent the license key functionality in the software,
> and you may not remove or obscure any functionality in the software that is protected by the
> license key.

The Additional Use Grant lets you modify, fork and redistribute OpenSteward, but it does not
relax that limitation. A build with the license checks removed, disabled or worked around is not
licensed, whether you built it yourself or got it from a fork.

Official images are signed with cosign (keyless, through Sigstore) and carry a signed SBOM, so
you can confirm an image came from this project's release pipeline before you run it. The
`cosign verify` recipe is in
[Dependencies & Supply Chain](../security/README.md#415-dependencies--supply-chain).

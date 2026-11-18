# Platform logos

OpenSteward ships **no platform logos**. The catalog renders brand-tinted
monogram tiles out of the box, and you choose whether to load real logos.

This page explains why, and walks through the three options.

**The short version:** sign in to the admin, go to **Platforms → Logos**, pick a
mode, and (for `local`) press Start fetch. Everything below is the detail behind
that screen — the licensing argument, the trade-offs, and the environment
variables available for GitOps deployments.

---

## Why they aren't included

Two separate reasons, and neither is fixed by an attribution file.

**Brandfetch's terms.** OpenSteward's logos come from the [Brandfetch Logo
API](https://docs.brandfetch.com/logo-api/overview). Their terms say
_"programmatic access to logo images is not permitted"_, _"we require logo
links to be directly embedded in your applications"_, and _"if your use case
requires caching, please contact us for a custom setup."_ Bulk-downloading
1,474 logos and committing them is exactly what that prohibits. They ask for
no attribution, so crediting them would satisfy nothing.

**They are other companies' trademarks.** The logos belong to the 1,474
platforms they represent, not to Brandfetch and not to OpenSteward. Showing
them to identify which platforms an integration supports is ordinary
nominative use, but _redistributing_ them inside a git repo and five
container images — which then mirror to the AWS, Azure and GCP marketplaces —
is a different thing.

Shipping none of them removes both problems, and lets you pick the trade-off
that suits your deployment rather than inheriting ours.

---

## The three options

|                           | `none` (default)            | `cdn`                                                      | `local`                     |
| ------------------------- | --------------------------- | ---------------------------------------------------------- | --------------------------- |
| **Logos shown**           | monogram tiles              | real logos                                                 | real logos                  |
| **External requests**     | none                        | one per logo, to Brandfetch                                | none at runtime             |
| **Brandfetch account**    | not needed                  | required                                                   | required (to fetch)         |
| **Brandfetch's position** | n/a                         | **the mode they sanction**                                 | caching — see below         |
| **Works air-gapped**      | yes                         | no                                                         | yes                         |
| **Disk**                  | none                        | none                                                       | ~17 MB                      |
| **Privacy**               | nothing leaves your network | Brandfetch sees your origin and which platforms are viewed | nothing leaves your network |

All three degrade gracefully. A missing file, an invalid client ID, or a
Brandfetch rate limit shows a monogram — never a broken image.

---

## Setting it from the admin UI

**Platforms → Logos**, or **step 3 of the setup wizard**. The page lets an
operator:

- pick the mode, with the trade-offs shown against each option;
- save a Brandfetch client ID (stored in the admin database, not in `.env`);
- run a logo fetch and watch it, cancel it, or delete every stored logo.

Changes take effect on the next page load — no restart, no redeploy. The admin
and docs-server both pick the setting up, so the two catalog pages stay in
agreement.

### How it relates to the environment variables

`LOGO_SOURCE` and `BRANDFETCH_CLIENT_ID` are supported and are the right
choice for a GitOps deployment that wants configuration in git. The rule is:

> **An admin-saved value wins. The environment variable is the bootstrap
> default and the fallback whenever nothing has been saved.**

So a deployment that sets `LOGO_SOURCE=cdn` in `.env` uses that value until
somebody chooses something in the admin.

### Where fetched logos are stored

In the **admin database**, not on disk — which is why the admin-triggered fetch
works at all. Every path the admin and docs-server can serve logos from is a
read-only mount: `docker-compose.hardening.yml` sets `read_only: true` on every
service, and the Helm chart hardcodes `readOnlyRootFilesystem` with no volume
for either pod. A database row is reachable from every replica and survives a
redeploy; a file written inside a container is neither.

The on-disk directory is also supported: logos resolve from the database
first, then `docs/platforms/logos/`, so CLI-fetched logos are served when no
database copy exists.

**docs-server needs `SERVICE_SECRET`** to read the setting from admin-api. The
shipped compose file passes it; on Kubernetes set `secrets.plain.serviceSecret`
(or the matching External Secrets key). Without it docs-server falls back to
`LOGO_SOURCE` from its environment.

---

### Option 1 — `none` (the default)

Do nothing. Every platform renders as a tile with its initials, tinted with
that platform's own brand colour.

This is the right choice if you are in a regulated or air-gapped environment,
or if you simply don't want a third-party dependency for decoration. It makes
no external requests, needs no account, and has no licensing surface at all.

---

### Option 2 — `cdn` (hotlink Brandfetch)

Logos load directly from Brandfetch's CDN in the browser. Nothing is stored on
your servers.

**This is the mode Brandfetch sanctions** — direct embedding is what their
terms ask for. It is the most compliant option.

The cost is privacy: each logo request tells Brandfetch your deployment's
origin (via the `Referer` header, which they require) and which platforms your
users are looking at. **If your threat model or compliance posture rules out
third-party calls from your admin UI, use `none` or `local` instead.**

```bash
# Get a free client ID at https://brandfetch.com/developers
LOGO_SOURCE=cdn
BRANDFETCH_CLIENT_ID=your-client-id
```

The client ID is not a secret — Brandfetch designed it to be embedded in
public `<img>` tags — so it is safe in a compose file or a ConfigMap.

Logos are requested as
`https://cdn.brandfetch.io/<domain>/fallback/404/icon?c=<clientId>`, where
`<domain>` comes from each platform's `website` in the catalog.

- `icon` is Brandfetch's square mark. Their `logo` is the wide wordmark,
  which shrinks to a thin strip in a tile.
- `fallback/404` makes Brandfetch answer 404 for a domain it has no icon
  for. That failure is what turns the tile into a monogram. Without it the
  CDN answers 200 with a generic placeholder, and no monogram ever shows.
- The roughly 70 platforms Brandfetch has no logo for therefore show
  monograms in this mode, as they do in `local`. Nothing else on the page is
  affected.

**Rate limits** ([their published figures](https://docs.brandfetch.com/logo-api/overview)):
500,000 requests/month, **1,000 requests per 5 minutes per IP**, and 2,400 per
5 minutes per customer. Images load lazily as you scroll, but paging through
the whole 1,548-platform catalog quickly can approach the per-IP limit. The
symptom is logos quietly becoming monograms, not an error.

---

### Option 3 — `local` (fetch once, serve yourself)

Fetch the logos to disk, then serve them from your own deployment. No runtime
calls to Brandfetch, so this works air-gapped and keeps browsing private.

**A note on Brandfetch's terms:** this is caching, and their terms say caching
"requires a custom setup" agreed with them. Fetching under your own client ID
makes that a matter between you and Brandfetch, on your own account — it is
not something OpenSteward can grant you. If you plan to run this way at any
scale, [talk to them](https://brandfetch.com/developers/contact/sales) first;
they invite exactly that conversation.

**From the admin UI** (no checkout needed): save a client ID under
**Platforms → Logos**, pick _Fetch and self-host_, and press **Start fetch**.
Logos land in the admin database and are served immediately.

A full run takes roughly **40 minutes**. That is deliberate: Brandfetch allows
1,000 requests per 5 minutes per IP, and the job paces itself under that limit
(`logos.fetch_delay_ms`, default 400 ms). You can leave the page — progress is
stored server-side. Roughly 70 of the 1,548 platforms have no logo at
Brandfetch at all; those are reported separately from failures, and re-running
skips everything already stored.

**From a repo checkout** (air-gapped builds, CI):

```bash
BRANDFETCH_CLIENT_ID=your-client-id pnpm --filter integration-server fetch:logos
```

Logos land in `docs/platforms/logos/` (gitignored). Then:

```bash
LOGO_SOURCE=local
```

Useful flags: `--slug=<slug>` for one platform, `--vertical=<name>` for one
vertical, `--force` to overwrite existing files.

Maintainers working in the repo can instead put the ID in `.env.scripts`
(copy `.env.scripts.example`); the environment variable takes precedence.

---

## Deployment

The logo directory must be readable by **admin** and **docs-server**, which
both serve it at `/data/platforms/logos/`.

### Docker Compose

```yaml
services:
  docs-server:
    environment:
      LOGO_SOURCE: local
    volumes:
      - ./docs/platforms/logos:/app/docs/platforms/logos:ro
  admin:
    environment:
      LOGO_SOURCE: local
    volumes:
      - ./docs/platforms/logos:/app/docs/platforms/logos:ro
```

For `cdn`, drop the volumes and set `LOGO_SOURCE: cdn` plus
`BRANDFETCH_CLIENT_ID` instead.

### Kubernetes / Helm

`cdn` needs no volume — set the two env vars on the `admin` and `docs-server`
deployments and you are done.

`local` needs the fetched directory mounted at
`/app/docs/platforms/logos`. The chart has no built-in volume for this, so
mount it yourself:

- **PersistentVolumeClaim** — run the fetch into the volume once (a `Job`, or
  `kubectl cp` into a pod), then mount it read-only on both deployments. Best
  for the full set.
- **ConfigMap** — workable only for a small subset; the whole set is ~17 MB
  and a ConfigMap is capped at ~1 MiB.
- **Bake your own image** — `FROM` the published image and `COPY` your fetched
  logos in. Note that this image is yours to keep internal: redistributing it
  puts you back in the position this page exists to avoid.

---

## Troubleshooting

**Some tiles are monograms with `LOGO_SOURCE=cdn`.** That is expected for the
roughly 70 platforms Brandfetch has no icon for: the request answers 404 and
the tile falls back.

**All tiles are monograms with `LOGO_SOURCE=cdn`.** Check the server logs for
`[logos] LOGO_SOURCE=cdn needs BRANDFETCH_CLIENT_ID` — an unset or empty
client ID falls back to `none` deliberately. Otherwise open devtools and look
at a request to `cdn.brandfetch.io`: it must carry a `Referer` header.
OpenSteward sets `referrerpolicy="strict-origin-when-cross-origin"` on each
logo `<img>` for this reason; a proxy that strips `Referer` will break it,
because Brandfetch rejects requests without one.

**Some tiles are monograms with `LOGO_SOURCE=local`.** Brandfetch has no logo
for that platform, or the fetch skipped it. Re-run for the one platform with
`--slug=<slug> --force`. Roughly 70 of the 1,548 platforms have no logo
available at all.

**`BRANDFETCH_CLIENT_ID is not set`** from the fetch script. Pass it as an
environment variable, or create `.env.scripts` from `.env.scripts.example`.

**Logos vanished after an upgrade.** Logos fetched from the admin UI live in
the admin database and survive a redeploy. Logos fetched with the CLI live in a
gitignored directory and are not baked into images — if you deploy by
rebuilding a container, either re-fetch from the admin UI or mount them as a
volume (above).

**The fetch will not start: "No Brandfetch client ID is set."** Save one under
Platforms → Logos first. The job deliberately does not fall back to
`BRANDFETCH_CLIENT_ID` from the environment, so that the ID on screen is always
the ID being used.

**The fetch failed with "Brandfetch rate-limited N platforms in a row."** Raise
`logos.fetch_delay_ms` under Settings and run it again. Logos already fetched
are kept, and **Fetch remaining logos** picks up only what is missing.

**The fetch failed with "Brandfetch refused these requests as automated
traffic."** This is their `automated_traffic` check, and it is keyed on the
request looking like a logo embedded in a page. A valid client ID does not
exempt you. Either use `cdn`, which is the mode they sanction, or contact them
for the caching agreement. The error names the Referer that was sent, which is
worth quoting to them.

**docs-server shows monograms but the admin shows logos.** docs-server cannot
read the setting — check that `SERVICE_SECRET` reaches it (see _How it relates
to the environment variables_ above).

---

## Related

- [`LICENSE`](../../LICENSE) — OpenSteward's own terms
- [`TRADEMARKS.md`](../../TRADEMARKS.md) — third-party marks
- [Brandfetch Logo API docs](https://docs.brandfetch.com/logo-api/overview)

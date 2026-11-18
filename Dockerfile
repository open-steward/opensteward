ARG APP

# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:24-alpine AS builder
# python3/make/g++ required by node-gyp to compile better-sqlite3 from source on musl/Alpine
RUN apk add --no-cache python3 make g++
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

# Copy workspace root files needed by pnpm install
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./

# Copy all workspace packages (needed for resolving workspace:* deps)
COPY packages/ packages/

# Every app's manifest — not its source — so the install layer below is
# identical for every value of APP.
#
# The install used to sit after `COPY apps/${APP}/`, which put that app's
# source in its cache key. Five images built from this file, so five different
# keys, so five full `pnpm install` runs with nothing shared between them —
# even inside a single build session, and even though the lockfile is the same
# for all of them. Measured at ~20-26s each, running concurrently, and they
# were the critical path of the whole compose build.
#
# Hoisted above the source copy they collapse to one shared stage that BuildKit
# reuses across all five images. It also stops an edit to one adapter file from
# invalidating that image's entire dependency install on a warm cache — the
# same reasoning that already keeps docs/ and scripts/ below this line.
#
# A new app needs a line here. Without one its manifest is missing at install
# time and its own build then installs a second, different layer — correct, but
# quietly back to paying for two installs.
COPY apps/admin/package.json apps/admin/
COPY apps/admin-api/package.json apps/admin-api/
COPY apps/docs-server/package.json apps/docs-server/
COPY apps/integration-server/package.json apps/integration-server/
COPY apps/mcp-server/package.json apps/mcp-server/
COPY apps/webhook-gateway/package.json apps/webhook-gateway/

# Install all workspace dependencies. APP-independent: shared by every image.
RUN pnpm install --frozen-lockfile

# Copy the target app's source. Below the install on purpose — see above.
ARG APP
COPY apps/${APP}/ apps/${APP}/

# The library builds below end with `node ../../scripts/build-stamp.mts`, which
# writes dist/.build-stamp.json. The rest of scripts/ is only copied after the
# build, so this one file has to come in first.
COPY scripts/build-stamp.mts scripts/build-stamp.mts

# @opensteward/license-token (the license token format and verifier) builds
# before shared: shared's licensing module compiles against its dist/. A
# separate RUN so the shared build line below stays exactly what
# scripts/build-stamp.test.ts greps.
RUN pnpm --filter @opensteward/license-token run build

# Build shared packages first, then the target app.
# No NODE_OPTIONS heap bump is set here: `tsc` is the native TypeScript 7
# binary — compiled Go, does not run on Node — and ignores NODE_OPTIONS
# entirely. See docs/architecture/build-and-workspace.md for why both
# compilers are installed.
#
# The three shared packages keep their full emit — apps import their `.d.ts`,
# so declarations are load-bearing there.
#
# ── integration-server ───────────────────────────────────────────────────
# It compiles as eleven per-vertical project references (one composite
# project per vertical, plus `kernel` and `app`), not as one 18,645-file
# program. That is a memory decision. Measured peak RSS of the tsc step on a
# 4 vCPU / 7.75 GiB Docker VM:
#
#     single program, no decl/declMap/srcMap     ~4,142 MB    7s
#     single program, --singleThreaded GOGC=10    2,755 MB   13s
#     project refs, plain `tsc -b`                4,401 MB    9s   <- WORSE
#     project refs, `tsc -b --builders 1`         3,606 MB    9s
#     project refs, + GOMEMLIMIT=1GiB            ~1,266 MB   10s
#     project refs, + --singleThreaded GOGC=10      852 MB   17s   <- below
#
# `--builders 1` is load-bearing: plain `tsc -b` builds the eleven projects
# concurrently and peaks HIGHER than not splitting at all. Whole-image
# effect measured at 6.21 -> 3.68 GiB VM peak for +1s of wall clock.
#
# `composite` is required by project references and forces declaration emit,
# so dist/ carries 18,645 unused `.d.ts` plus per-project `.tsbuildinfo`
# through the build. Both are deleted below. Nothing imports this app: the
# runtime stage copies only `dist/` and runs `node dist/index.js`, and no
# entrypoint passes `--enable-source-maps` (nor is `source-map-support`
# installed), so declaration maps and source maps are consumed by nobody —
# they stay off in every per-vertical tsconfig.
#
# Do NOT delete the tsbuildinfo files outside this container. They are what
# makes a local incremental rebuild 0.4-0.7s instead of 5.1s.
#
# ── every other app ──────────────────────────────────────────────────────
# Small single programs. The flags drop the same unused artifacts without
# the project-reference machinery, and `composite` is disabled because it
# requires `declaration`.
#
# If you ever want stack traces mapped back to TypeScript in a container,
# add `--enable-source-maps` to the runtime CMD and turn `sourceMap` back on
# for that app.
RUN pnpm --filter @opensteward/shared run build \
 && pnpm --filter @opensteward/destinations run build \
 && pnpm --filter @opensteward/design-system run build \
 && pnpm --filter @opensteward/platforms-ui run build \
 && pnpm --filter @opensteward/codegen run build \
 && if [ "${APP}" = "integration-server" ]; then \
      GOGC=10 pnpm --filter ${APP} exec tsc -b --builders 1 --singleThreaded \
      && find apps/${APP}/dist -name '*.d.ts' -delete \
      && rm -f apps/${APP}/dist/.tsbuildinfo-*; \
    else \
      pnpm --filter ${APP} exec tsc \
        --declaration false --declarationMap false --sourceMap false --composite false; \
    fi

# docs-server only: generate the ⌘K search index from docs/*.md so a
# fresh build doesn't ship a docs-server with an empty palette. The
# index is a pure function of the in-tree docs (no network, no
# secrets), so it can run during the build with no extra inputs.
# Copies docs/ + scripts/ AFTER install so doc edits don't invalidate
# the dependency-install cache layer.
COPY docs/ docs/
COPY scripts/ scripts/
RUN if [ "${APP}" = "docs-server" ]; then \
      pnpm docs:search-index; \
    fi

# ── Licensing: which license keys this image trusts ──────────────────────
# keyring.ts loads the development public keys only through a guarded
# require of its keys.dev module, so deleting the compiled module removes
# them, and nothing at runtime can add a key back. The default `production`
# profile deletes it, then fails the build if any trace survives (the module,
# a quoted development kid, the development key bytes) or if the compiled
# keyring trusts anything but the five production kids. Every image ships
# packages/shared/dist, so this runs for every APP. `development` keeps the
# development keys, for a maintainer's local stack only
# (docker-compose.override.yml); images.yml never sets it. Any other value
# fails the build. This is the builder stage: only the COPY --from=builder
# lines below reach the runtime image, so a delete here leaves no whiteout.
ARG OPENSTEWARD_BUILD_PROFILE=production
RUN case "${OPENSTEWARD_BUILD_PROFILE}" in \
      production) \
        rm -f packages/shared/dist/licensing/keys.dev.* \
        && pnpm exec tsx scripts/check-license-keys.ts \
             --artifact packages/shared/dist \
             --artifact packages/license-token/dist \
             --artifact apps/${APP}/dist ;; \
      development) \
        echo "WARNING: OPENSTEWARD_BUILD_PROFILE=development: this image trusts the development license keys. Never publish it." ;; \
      *) \
        echo "unknown OPENSTEWARD_BUILD_PROFILE=${OPENSTEWARD_BUILD_PROFILE} (production | development)" >&2; exit 1 ;; \
    esac

# docs-server only: stage docs/ for the runtime image. docs-server reads its
# guides, the OpenAPI specs and the platform catalog from /app/docs
# (apps/docs-server/src/index.ts), and nothing else put them there — the
# compose bind mount `./docs:/app/docs:ro` was the only source, so a Helm or
# marketplace deployment served a docs site with no guides, no Unified API
# reference and no catalog. admin reads one file, the platform catalog
# docs/platforms/platforms.json (apps/admin/src/core/routes/platform-catalog.ts),
# which compose bind-mounts for it the same way, so admin gets that file alone.
# The other apps never read docs/ at runtime, so for them /docs-out stays empty
# and the runtime COPY below adds nothing. Same
# existence-test-in-the-builder pattern as /assets, for the same reason.
# .dockerignore already keeps docs/platforms/logos, docs/superpowers and
# docs/research out of the build context, so none of them can ship this way.
# A compose bind mount over /app/docs still wins, for live editing.
RUN mkdir -p /docs-out \
 && if [ "${APP}" = "docs-server" ]; then cp -r docs /docs-out/docs; fi \
 && if [ "${APP}" = "admin" ]; then \
      mkdir -p /docs-out/docs/platforms \
      && cp docs/platforms/platforms.json /docs-out/docs/platforms/platforms.json; \
    fi

# Stage the app's optional static assets into one directory, so the runtime
# stage can pull them in with a single app-agnostic COPY.
#
# They cannot be COPYed directly: `COPY` fails the build when its source does
# not exist, and no two apps carry the same set — admin has all three,
# docs-server has none of them:
#
#     app                  config  views  public
#     integration-server   yes     —      —
#     admin                yes     yes    yes
#     admin-api            yes     —      —
#     webhook-gateway      yes     —      —
#     docs-server          —       —      —
#
# Doing the existence test here, in a shell, is what lets the runtime stage
# stay uniform. The loop is over asset *kinds*, not apps, so an app that later
# grows a views/ or public/ is picked up with no edit to this file.
RUN mkdir -p /assets \
 && for d in config views public; do \
      if [ -d "apps/${APP}/$d" ]; then cp -r "apps/${APP}/$d" "/assets/$d"; fi; \
    done

# ── Runtime stage ────────────────────────────────────────────────────────────
FROM node:24-alpine
# No compiler toolchain here, deliberately. `apk add python3 make g++` used to
# be repeated in this stage. Measured on node:24-alpine: it takes the image
# from 18 to 48 apk packages and adds 273 MB — and node-gyp never ran, because
# better-sqlite3 13 and bcrypt 6 both ship musl prebuilds and resolve them at
# require() time (better-sqlite3 lib/binding.js `getPrebuildPath()`,
# bcrypt via node-gyp-build). Verified on the pre-change image:
# better-sqlite3's build/Release contains no .node at all.
#
# corepack/pnpm are NOT installed here either — see the single install RUN
# below, which activates, uses and removes them in one layer.
#
# Upgrade OpenSSL, and only OpenSSL. With the toolchain gone, `libcrypto3` and
# `libssl3` were the ONLY remaining fixable HIGH/CRITICAL findings in the image
# — CVE-2026-14456, which Alpine fixes in 3.5.8-r0 while `node:24-alpine`
# currently ships 3.5.7-r0. Two findings, both closed here, taking the Trivy
# gate from 2 to 0.
#
# Targeted rather than a blanket `apk upgrade`: this must not quietly pull in
# unrelated package churn between builds. It adds no packages — `apk info` shows
# the same 18 either side — and `--no-cache` leaves no index behind.
#
# The trade this makes, stated plainly: the image's OS package set is no longer
# a pure function of the `node:24-alpine` digest, because it now also depends on
# what the Alpine mirror is serving at build time. That costs some
# reproducibility and buys a rebuild that picks up OpenSSL fixes without waiting
# for the upstream Node image, which typically lags. Pinning the base by digest
# (docs/security/README.md §4.16) is the other half and is still worth doing.
#
# READ THIS BEFORE TRUSTING THE GREEN GATE. This upgrade does NOT patch the
# OpenSSL that this application actually uses. Verified in the built image:
#
#   ldd $(command -v node) | grep -i ssl     -> nothing; Node links OpenSSL STATICALLY
#   node -p process.versions.openssl         -> 3.5.7   (the version WITH CVE-2026-14456)
#   apk list -I libcrypto3                   -> 3.5.8-r0 (patched, and unused by Node)
#
# Only `/usr/bin/ssl_client` (busybox's HTTPS helper) and `/sbin/apk` link the
# system libraries. Every outbound adapter call goes through Node's own bundled
# copy, which Trivy never scanned — not before this change and not after, because
# a statically linked library is not an apk package.
#
# So the honest reading of a passing gate is: no *scannable* fixable HIGH/CRITICAL
# remains. It is not evidence that Node's TLS is patched. That needs an upstream
# `node:24-alpine` built against OpenSSL >= 3.5.8; watch the base image rather
# than the gate. Keeping this upgrade is still right — it patches ssl_client and
# apk, and it removes a finding that would otherwise be permanently red — but it
# must not be mistaken for the larger fix.
RUN apk upgrade --no-cache libcrypto3 libssl3

WORKDIR /app

ARG APP

# Image-level license metadata, so scanners and registries can read the terms
# without unpacking the image. OpenSteward is source-available: Elastic-2.0
# plus an Additional Use Grant (see LICENSE). The client packages published to
# npm — @opensteward/sdk, /cli, /mcp-server — are Apache-2.0 and are not what
# these images ship.
LABEL org.opencontainers.image.licenses="Elastic-2.0" \
      org.opencontainers.image.title="OpenSteward" \
      org.opencontainers.image.vendor="Falco Consulting AB" \
      org.opencontainers.image.url="https://opensteward.dev" \
      org.opencontainers.image.source="https://github.com/open-steward/opensteward"

# Containers are production by default. Several guards key off this and fail
# OPEN without it — `adminGuard` (packages/shared/src/control-plane/admin-guard.ts)
# serves every `/admin/*` route unauthenticated when ADMIN_SECRET is unset and
# NODE_ENV !== 'production', and `auth-middleware.ts` applies the same
# `devOpen` fallthrough to `/v1/*`. That is intended as a local-dev
# convenience. Without this, a compose stack publishing ports on 0.0.0.0
# would serve the full platform registry, API keys and connections with no
# credential at all.
#
# Setting it here, rather than in docker-compose.yml, means every consumer of
# these images gets the safe default — compose, Helm, the marketplace
# artifacts — instead of only the operators who happen to read the compose file.
# `assertSecret` also switches from warn to throw under this value, so a weak
# or missing JWT_SECRET/STORE_SECRET now fails a container at boot rather than
# silently signing tokens with a placeholder.
#
# Local development is unaffected: `pnpm dev` runs outside the container and
# leaves NODE_ENV unset, so the dev fallthrough still applies there.
#
# With this set, ADMIN_SECRET becomes REQUIRED to use /admin/* — without it
# adminGuard returns 403 ADMIN_DISABLED rather than serving the route open.
ENV NODE_ENV=production

# Copy workspace root files
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./

# Copy the shared package's manifest (runtime dependency). Its dist/ comes in
# after the prod install below: see the comment there.
COPY --from=builder /app/packages/shared/package.json packages/shared/package.json

# Built license-token package: a runtime dependency of shared's licensing
# module, which every app imports. Unconditional, like shared above.
COPY --from=builder /app/packages/license-token/package.json packages/license-token/package.json
COPY --from=builder /app/packages/license-token/dist/ packages/license-token/dist/

# Copy built destinations package (runtime dependency for integration-server:
# the warehouse/lake export worker). Its cloud SDKs and parquet-wasm are
# loaded on first use, so an image that never configures a destination does
# not pay for them at boot.
COPY --from=builder /app/packages/destinations/package.json packages/destinations/package.json
COPY --from=builder /app/packages/destinations/dist/ packages/destinations/dist/

# Copy built platforms-ui package (runtime dependency for docs-server and admin)
COPY --from=builder /app/packages/platforms-ui/package.json packages/platforms-ui/package.json
COPY --from=builder /app/packages/platforms-ui/dist/ packages/platforms-ui/dist/

# Copy built codegen package (runtime dependency for admin-api's logo fetcher).
# codegen is otherwise a build-time-only package; admin-api imports
# `@opensteward/codegen/logos` so an operator can fetch platform logos from the
# admin UI. Without this the image has no fetcher at all — the CLI script that
# does the same job is never compiled into dist/ and tsx is stripped by the
# --prod install below.
COPY --from=builder /app/packages/codegen/package.json packages/codegen/package.json
COPY --from=builder /app/packages/codegen/dist/ packages/codegen/dist/

# Copy built design-system package + static assets (runtime dependency for docs-server)
COPY --from=builder /app/packages/design-system/package.json packages/design-system/package.json
COPY --from=builder /app/packages/design-system/dist/ packages/design-system/dist/
COPY --from=builder /app/packages/design-system/tokens.css packages/design-system/tokens.css
COPY --from=builder /app/packages/design-system/base.css packages/design-system/base.css
COPY --from=builder /app/packages/design-system/components.css packages/design-system/components.css
COPY --from=builder /app/packages/design-system/swagger-theme.css packages/design-system/swagger-theme.css
COPY --from=builder /app/packages/design-system/fonts/ packages/design-system/fonts/
COPY --from=builder /app/packages/design-system/logo/ packages/design-system/logo/
COPY --from=builder /app/packages/design-system/icons/ packages/design-system/icons/
# Vendored browser assets (Phosphor, Swagger UI, lunr, Mermaid, svg-pan-zoom).
# Produced in the builder by design-system's sync-vendor step, served from
# /design/vendor/. Without this the Unified API and Operator API pages render
# no Swagger UI and the docs lose search and diagrams, so this COPY is
# load-bearing, not decorative.
COPY --from=builder /app/packages/design-system/vendor/ packages/design-system/vendor/

# Copy app package.json
COPY --from=builder /app/apps/${APP}/package.json apps/${APP}/package.json

# The one command in this stage that needs a package manager. corepack, pnpm,
# the install itself and the removal of all three are a SINGLE layer on
# purpose: corepack's pnpm cache (~30 MB, and 59 of the 73 HIGH/CRITICAL Trivy
# findings this image used to carry) is written by `corepack prepare`, so
# deleting it in a later RUN would only add a whiteout — the bytes would still
# ship in the pull. Fused into one layer, they are never committed at all.
#
# npm, corepack and Yarn 1.x (/opt/yarn-v*, reachable by path even after its
# PATH shim goes) come from the node:24-alpine base layer, so removing them
# here can only whiteout them: they leave the flattened filesystem the scanner
# reads (10 more findings today, and Yarn is still enumerated in the SBOM) but
# still cost their bytes in the shared base layer. That is the ceiling without
# changing base image, which is out of scope.
#
# --ignore-scripts is safe here and is not the trap described in
# docs/architecture/build-and-workspace.md. That warning is about
# `pnpm install --ignore-scripts` in a *dev* checkout, where better-sqlite3
# then has no addon at all. In this image no production
# dependency compiles anything: the only lifecycle script in the whole prod
# tree is bcrypt's `install: node-gyp-build`, which merely *locates* an
# already-shipped prebuild. Both native modules resolve their binding at
# require() time, from prebuilds/, whether or not that script ever ran.
#
# The prebuild prune keeps exactly the two musl targets. CI builds
# linux/amd64 AND linux/arm64 on native runners (.github/workflows/images.yml),
# so BOTH linuxmusl-x64 and linuxmusl-arm64 must survive — each build keeps the
# one it cannot use, because `find` runs on the target arch and deleting by
# arch would silently break whichever arch is not being built here. The six
# dropped ones (darwin-*, win32-*, and the two glibc linux-*) can never load on
# Alpine. deps/ and src/ are better-sqlite3's amalgamated SQLite C sources and
# binding.gyp scaffolding — inputs to a node-gyp compile that this stage no
# longer has a compiler for.
RUN corepack enable && corepack prepare pnpm@9 --activate \
 && pnpm install --frozen-lockfile --prod --ignore-scripts \
 && find node_modules/.pnpm -path '*/better-sqlite3/prebuilds/*' \
      ! -name 'linuxmusl-x64.node' ! -name 'linuxmusl-arm64.node' -delete \
 && rm -rf node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3/deps \
           node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3/src \
           node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3/build \
 && corepack disable \
 && rm -rf /usr/local/lib/node_modules/npm \
           /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
           /usr/local/bin/pnpm /usr/local/bin/pnpx /usr/local/bin/yarn \
           /usr/local/bin/yarnpkg /opt/yarn-v* \
           /root/.cache /root/.npm /root/.local /usr/local/share/.cache

# Built shared package. Copied AFTER the prod install, unlike the other
# packages' dist/ above, because it is the one built directory whose content
# depends on the license build profile: the builder's `production` step deletes
# packages/shared/dist/licensing/keys.dev.*, `development` keeps them. BuildKit
# keys a `COPY --from` on the content it copies, so with this COPY above the
# install, switching profile missed the cache here and redid the install. The
# install does not need it: pnpm links a workspace package from its
# package.json alone (shared declares no `bin`).
COPY --from=builder /app/packages/shared/dist/ packages/shared/dist/

# The license build profile this image was built with (see the builder's
# licensing step). Anything but `production` trusts development keys and must
# never be published; images.yml's in-image probe checks the files themselves.
# Also declared after the install: every RUN below an ARG carries its value in
# its cache key. Both moves are needed for a profile switch to reuse the
# install layer; either one alone still redoes it.
ARG OPENSTEWARD_BUILD_PROFILE=production
LABEL org.opensteward.build-profile="${OPENSTEWARD_BUILD_PROFILE}"

# Copy compiled app code
COPY --from=builder --chown=node:node /app/apps/${APP}/dist/ apps/${APP}/dist/

# Optional static assets (config/, views/, public/), pre-selected in the
# builder — see the staging RUN there for why the existence test cannot live
# in this stage. /assets is always present and may be empty (docs-server).
COPY --from=builder --chown=node:node /assets/ apps/${APP}/

# docs/ — all of it for docs-server, docs/platforms/platforms.json for admin,
# nothing (a no-op) for the other apps. See the /docs-out staging RUN in the builder.
COPY --from=builder --chown=node:node /docs-out/ /app/

# The OpenSteward release this image belongs to: the repo-level VERSION file
# that scripts/release.ts bumps and images.yml tags. Every service reports it
# as `release` on /version (readRelease() in packages/shared walks up from the
# working directory, apps/${APP}, to this copy), and the admin's System page
# and sidebar show it to operators.
COPY VERSION /app/VERSION

# Create data directory for SQLite databases, then drop root.
# node:alpine ships a `node` user (uid 1000) by default. data/ is the only
# path the runtime writes to, so it is the only one chowned — the app's own
# files arrive owned by node via `COPY --chown` above, and everything else
# (node_modules, packages/) stays root-owned and world-readable, which is all
# a read-only code path needs.
#
# This replaces a `chown -R node:node /app`. A recursive chown rewrites every
# inode under /app, and Docker's copy-on-write then stores a second full copy
# of node_modules and packages/ in that layer — ~192 MB of pure duplication
# for a permission bit that no code path reads.
RUN mkdir -p apps/${APP}/data && chown node:node apps/${APP}/data

# Build metadata baked into the image so /version can report it at
# runtime. Both default to "dev" so a developer building locally
# without `--build-arg` gets meaningful (if generic) values rather
# than empty strings. docker-compose.yml forwards GIT_SHA / BUILD_TIME
# from the operator's shell or .env.
# Declared after the last RUN: an ARG's value, and an ENV's, is in the cache
# key of every RUN below it, so above the prod install every new commit (CI,
# or compose forwarding GIT_SHA) redid that install. Nothing above reads them.
ARG GIT_SHA=dev
ARG BUILD_TIME=dev
ENV GIT_SHA=$GIT_SHA
ENV BUILD_TIME=$BUILD_TIME

WORKDIR /app/apps/${APP}
USER node
EXPOSE 3000-3099
CMD ["node", "dist/index.js"]

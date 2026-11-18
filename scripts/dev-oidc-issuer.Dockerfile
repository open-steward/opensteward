# The mock identity provider for rehearsing admin SSO, as a container:
#
#   docker compose --profile sso-dev up -d
#
# Deliberately not a stage of the root Dockerfile. That one installs the
# whole workspace and compiles an app; this needs tsx, jose and two source
# files from packages/shared — the same files `pnpm dev:oidc-issuer` runs on
# the host, with the versions the workspace lockfile resolves, so the two
# never drift. Build context is the repo root (see docker-compose.yml).
#
# Dev tool: no passwords, in-memory keys, any redirect_uri. Compose publishes
# it on the host's loopback only. Never ship it anywhere that matters.
FROM node:24-alpine
WORKDIR /app
RUN npm init -y >/dev/null \
 && npm install --no-package-lock --no-audit --no-fund --omit=dev tsx@4.23.12 jose@6.2.8 \
 && chown -R node:node /app
COPY packages/shared/src/auth/mock-oidc-issuer.ts packages/shared/src/auth/mock-oidc-login.ts packages/shared/src/auth/
COPY scripts/dev-oidc-issuer.ts scripts/
USER node
EXPOSE 9400
ENTRYPOINT ["node_modules/.bin/tsx", "scripts/dev-oidc-issuer.ts"]
# 0.0.0.0 inside the container; compose maps it to 127.0.0.1:9400 on the host.
# The issuer string stays http://localhost:9400 — what the browser uses, and
# what admin-api sees through the sso-dev-proxy bridge.
CMD ["--host", "0.0.0.0", "--port", "9400", "--issuer", "http://localhost:9400"]

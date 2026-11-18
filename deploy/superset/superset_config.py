# OpenSteward's Apache Superset configuration (embedded dashboards).
#
# Loaded by Superset as `superset_config.py` (the compose image copies it to
# /app/pythonpath/superset_config.py; the Helm chart mounts it at
# /app/opensteward/superset_config.py and execs it from configOverrides, after
# the Superset chart's own generated config). Every value comes from the
# environment, so one file serves both. The Helm chart carries a copy in
# deploy/helm/opensteward/files/superset/ — keep them identical (a test checks).
#
# Security model (docs/deployment/superset.md):
#   - OpenSteward operators never log in here: the admin UI embeds dashboards
#     with 5-minute guest tokens minted by admin-api, each carrying a row-level
#     security clause for the operator's tenant scope.
#   - Guests get the minimal `OpenStewardGuest` role (bootstrap-roles.py): read
#     dashboards and chart data, never SQL Lab, never datasets.
#   - Superset reads only the masked `os_analytics` views, as a read-only SQL
#     principal (see apps/admin-api/src/scripts/superset-bootstrap.ts).
#   - Only the admin UI origin may frame Superset (CSP frame-ancestors).
#   - Dashboard authors sign in with your IdP (OIDC, below) or a local account.
#
# Environment:
#   SUPERSET_SECRET_KEY          required. Signs sessions and encrypts stored
#                                database passwords. Never change it after
#                                first boot without `superset re-encrypt-secrets`.
#   SUPERSET_GUEST_TOKEN_SECRET  optional. Signs guest tokens; derived from
#                                SUPERSET_SECRET_KEY when unset.
#   SUPERSET_METADATA_DB_URI     Superset's own metadata database, e.g.
#                                postgresql+psycopg2://superset:…@postgres:5432/superset.
#                                Unset = leave whatever an earlier config set
#                                (the Helm chart's generated config).
#   SUPERSET_REDIS_URL           e.g. redis://superset-redis:6379 — caches and
#                                Celery. Unset = leave earlier settings.
#   OPENSTEWARD_ADMIN_ORIGIN     required. The admin UI origin(s) allowed to
#                                embed Superset, comma-separated
#                                (e.g. https://admin.example.com).
#   SUPERSET_SESSION_COOKIE_SECURE  default true. Secure + SameSite=None
#                                cookies, needed to embed across sites over
#                                HTTPS. Set false ONLY for plain-HTTP local
#                                trials (then SameSite=Lax).
#   SUPERSET_ENABLE_PROXY_FIX    true behind a TLS-terminating reverse proxy.
#   SUPERSET_OIDC_*              optional OIDC sign-in for dashboard authors
#                                (see the bottom of this file).
import hashlib
import hmac
import json
import os
from urllib.parse import urlsplit


def _env(name, default=None):
    value = os.environ.get(name)
    return value if value not in (None, "") else default


def _bool(name, default):
    value = _env(name)
    if value is None:
        return default
    return value.strip().lower() in ("1", "true", "yes", "on")


def _origins(raw):
    out = []
    for part in (raw or "").split(","):
        part = part.strip()
        if not part:
            continue
        parsed = urlsplit(part)
        if parsed.scheme in ("http", "https") and parsed.netloc:
            origin = f"{parsed.scheme}://{parsed.netloc}"
            if origin not in out:
                out.append(origin)
    return out


# ── Secrets ────────────────────────────────────────────────────────────────

SECRET_KEY = _env("SUPERSET_SECRET_KEY")
if not SECRET_KEY or len(SECRET_KEY) < 32:
    raise RuntimeError(
        "SUPERSET_SECRET_KEY must be set to at least 32 random characters "
        "(scripts/generate-secrets.sh mints one)."
    )

# Superset's default guest-token secret is a public placeholder; a token signed
# with it would be accepted by any instance that kept it. Always override.
GUEST_TOKEN_JWT_SECRET = _env("SUPERSET_GUEST_TOKEN_SECRET") or hmac.new(
    SECRET_KEY.encode(), b"opensteward-superset-guest-token", hashlib.sha256
).hexdigest()
GUEST_TOKEN_JWT_ALGO = "HS256"
# Matches the 5 minutes admin-api promises; the embedded SDK refreshes early.
GUEST_TOKEN_JWT_EXP_SECONDS = 300
GUEST_ROLE_NAME = "OpenStewardGuest"

# ── Metadata database, caches, Celery ──────────────────────────────────────

_metadata_uri = _env("SUPERSET_METADATA_DB_URI")
if _metadata_uri:
    SQLALCHEMY_DATABASE_URI = _metadata_uri

_redis = _env("SUPERSET_REDIS_URL")
if _redis:
    _redis = _redis.rstrip("/")

    def _cache(prefix, db, timeout):
        return {
            "CACHE_TYPE": "RedisCache",
            "CACHE_DEFAULT_TIMEOUT": timeout,
            "CACHE_KEY_PREFIX": prefix,
            "CACHE_REDIS_URL": f"{_redis}/{db}",
        }

    CACHE_CONFIG = _cache("superset_", 1, 300)
    DATA_CACHE_CONFIG = _cache("superset_data_", 1, 300)
    FILTER_STATE_CACHE_CONFIG = _cache("superset_filter_", 1, 86400)
    EXPLORE_FORM_DATA_CACHE_CONFIG = _cache("superset_explore_", 1, 86400)

    class CeleryConfig:  # pylint: disable=too-few-public-methods
        broker_url = f"{_redis}/0"
        result_backend = f"{_redis}/0"
        imports = ("superset.sql_lab", "superset.tasks.cache")
        worker_prefetch_multiplier = 1
        task_acks_late = False

    CELERY_CONFIG = CeleryConfig

# ── Features ───────────────────────────────────────────────────────────────

FEATURE_FLAGS = {
    "EMBEDDED_SUPERSET": True,
    "DASHBOARD_RBAC": True,
    # Jinja in SQL would let an author template around the RLS columns.
    "ENABLE_TEMPLATE_PROCESSING": False,
    "ALERT_REPORTS": False,
}

# No anonymous access: the Public role gets nothing.
PUBLIC_ROLE_LIKE = None
# Refuse SQLite/shillelagh connections an author might add.
PREVENT_UNSAFE_DB_CONNECTIONS = True
# No telemetry pixel.
SCARF_ANALYTICS = False

# ── Framing, CSP, CORS, cookies ────────────────────────────────────────────

ADMIN_ORIGINS = _origins(_env("OPENSTEWARD_ADMIN_ORIGIN"))
if not ADMIN_ORIGINS:
    raise RuntimeError(
        "OPENSTEWARD_ADMIN_ORIGIN must name the OpenSteward admin UI origin "
        "(e.g. https://admin.example.com): it is the only site allowed to embed Superset."
    )

TALISMAN_ENABLED = True
TALISMAN_CONFIG = {
    "content_security_policy": {
        "base-uri": ["'self'"],
        "default-src": ["'self'"],
        "img-src": ["'self'", "blob:", "data:"],
        "worker-src": ["'self'", "blob:"],
        "connect-src": ["'self'"],
        "object-src": "'none'",
        "style-src": ["'self'", "'unsafe-inline'"],
        "font-src": ["'self'", "data:"],
        "script-src": ["'self'", "'strict-dynamic'"],
        # The one control that decides who may frame Superset.
        "frame-ancestors": ["'self'", *ADMIN_ORIGINS],
    },
    "content_security_policy_nonce_in": ["script-src"],
    # X-Frame-Options cannot list an origin; frame-ancestors governs instead.
    "frame_options": None,
    "force_https": False,
    "session_cookie_secure": _bool("SUPERSET_SESSION_COOKIE_SECURE", True),
}
TALISMAN_DEV_CONFIG = TALISMAN_CONFIG
CONTENT_SECURITY_POLICY_WARNING = False

# The embedded SDK talks to Superset through the iframe (postMessage), not
# CORS; allow only the admin origin for anything that does call the API.
ENABLE_CORS = True
CORS_OPTIONS = {
    "supports_credentials": True,
    "origins": ADMIN_ORIGINS,
    "resources": [r"/api/*"],
    "allow_headers": ["Content-Type", "X-CSRFToken", "X-GuestToken", "Authorization"],
}

# An embedded iframe is a third-party context: its cookies must be
# SameSite=None, which browsers only accept with Secure (HTTPS). Plain-HTTP
# trials must set SUPERSET_SESSION_COOKIE_SECURE=false and then rely on
# SameSite=Lax — which works when the admin UI and Superset are the same site
# (e.g. localhost:3000 and localhost:8088), not across sites.
SESSION_COOKIE_SECURE = _bool("SUPERSET_SESSION_COOKIE_SECURE", True)
SESSION_COOKIE_SAMESITE = "None" if SESSION_COOKIE_SECURE else "Lax"
SESSION_COOKIE_HTTPONLY = True
WTF_CSRF_ENABLED = True

ENABLE_PROXY_FIX = _bool("SUPERSET_ENABLE_PROXY_FIX", False)

# ── SQL Lab ────────────────────────────────────────────────────────────────
# Guests never get SQL Lab (bootstrap-roles.py grants them no SQL Lab
# permission, and the OpenSteward database is created with
# expose_in_sqllab=false). Authors with Alpha/Admin can still use it on
# databases they add themselves.
SQLLAB_CTAS_NO_LIMIT = False

# ── Optional: OIDC sign-in for dashboard authors ───────────────────────────
# Off unless SUPERSET_OIDC_ISSUER is set. Guests (embedded viewers) never sign
# in; this is for the people who build dashboards in Superset itself.
#
#   SUPERSET_OIDC_ISSUER         https://idp.example.com/realms/acme
#   SUPERSET_OIDC_CLIENT_ID      client registered for https://<superset>/oauth-authorized/oidc
#   SUPERSET_OIDC_CLIENT_SECRET
#   SUPERSET_OIDC_SCOPE          default "openid email profile"
#   SUPERSET_OIDC_GROUPS_CLAIM   claim listing the user's groups (default "groups")
#   SUPERSET_OIDC_ROLES_MAPPING  JSON: IdP group -> Superset roles, e.g.
#                                {"bi-authors": ["Alpha"], "bi-admins": ["Admin"]}
#   SUPERSET_OIDC_DEFAULT_ROLE   role for a first sign-in with no mapped group
#                                (default "Gamma": can view, cannot build)
if _env("SUPERSET_OIDC_ISSUER"):
    from flask_appbuilder.security.manager import AUTH_OAUTH

    from superset.security import SupersetSecurityManager

    _issuer = _env("SUPERSET_OIDC_ISSUER").rstrip("/")
    _groups_claim = _env("SUPERSET_OIDC_GROUPS_CLAIM", "groups")

    class OpenStewardSecurityManager(SupersetSecurityManager):
        """Reads the generic OIDC userinfo, including the groups claim."""

        def get_oauth_user_info(self, provider, response=None):
            if provider != "oidc":
                return super().get_oauth_user_info(provider, response)
            me = self.appbuilder.sm.oauth_remotes[provider].userinfo()
            groups = me.get(_groups_claim) or []
            if isinstance(groups, str):
                groups = [groups]
            return {
                "username": me.get("preferred_username") or me.get("email") or me["sub"],
                "email": me.get("email", ""),
                "first_name": me.get("given_name", ""),
                "last_name": me.get("family_name", ""),
                "role_keys": [str(g) for g in groups],
            }

    CUSTOM_SECURITY_MANAGER = OpenStewardSecurityManager
    AUTH_TYPE = AUTH_OAUTH
    OAUTH_PROVIDERS = [
        {
            "name": "oidc",
            "icon": "fa-openid",
            "token_key": "access_token",
            "remote_app": {
                "client_id": _env("SUPERSET_OIDC_CLIENT_ID"),
                "client_secret": _env("SUPERSET_OIDC_CLIENT_SECRET"),
                "server_metadata_url": f"{_issuer}/.well-known/openid-configuration",
                "client_kwargs": {"scope": _env("SUPERSET_OIDC_SCOPE", "openid email profile")},
            },
        }
    ]
    AUTH_USER_REGISTRATION = True
    AUTH_USER_REGISTRATION_ROLE = _env("SUPERSET_OIDC_DEFAULT_ROLE", "Gamma")
    AUTH_ROLES_MAPPING = json.loads(_env("SUPERSET_OIDC_ROLES_MAPPING", "{}"))
    AUTH_ROLES_SYNC_AT_LOGIN = True

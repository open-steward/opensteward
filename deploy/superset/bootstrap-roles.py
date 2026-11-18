"""Create the roles and the service account OpenSteward's embedded dashboards need.

Run inside the Superset image after `superset db upgrade && superset init`
(compose `superset-init`, the Helm chart's init job):

    python /app/opensteward/bootstrap-roles.py

Idempotent. It:

  1. creates/refreshes the OpenStewardGuest role (GUEST_ROLE_NAME) with the
     minimal permissions an embedded dashboard needs — Superset's own
     PUBLIC_ROLE_PERMISSIONS set — minus every SQL Lab permission, and
     replaces whatever the role held before, so drift is undone on each run.
     Guests reach a dataset only through a chart on a dashboard their guest
     token names (Superset's embedded access check), so the role holds no
     datasource permission. When the "OpenSteward analytics" database already
     exists it also grants `database_access` on it, and nothing else;
  2. creates the service account (SUPERSET_SERVICE_USERNAME /
     SUPERSET_SERVICE_PASSWORD) that admin-api and the superset-bootstrap job
     log in as, with the Admin role, or resets its password to the configured
     one. It needs Admin for `can_grant_guest_token` and to create the
     database, datasets, charts and embedded configurations.
"""
import os
import sys

GUEST_ROLE = "OpenStewardGuest"
ANALYTICS_DATABASE = "OpenSteward analytics"

# Never granted to guests, whatever Superset's defaults become.
FORBIDDEN_VIEW_MENUS = {
    "SQL Lab",
    "SQL Editor",
    "SQLLab",
    "Saved Queries",
    "SavedQuery",
    "Query",
    "Query Search",
    "Queries",
    "TabStateView",
    "TableSchemaView",
    "SqlLabPermalinkRestApi",
    "Database",
    "Dataset",
    "Security",
    "Row Level Security",
}
FORBIDDEN_PERMISSIONS = {"can_sqllab", "can_sqllab_history", "can_execute_sql_query", "all_datasource_access", "all_database_access"}


def main() -> int:
    from superset.app import create_app

    app = create_app()
    with app.app_context():
        from superset import db, security_manager as sm
        from superset.models.core import Database

        wanted = set(getattr(sm, "PUBLIC_ROLE_PERMISSIONS", set()))
        if not wanted:
            print("bootstrap-roles: this Superset has no PUBLIC_ROLE_PERMISSIONS set", file=sys.stderr)
            return 1

        role = sm.find_role(GUEST_ROLE) or sm.add_role(GUEST_ROLE)
        pvms = []
        skipped = []
        for perm, view in sorted(wanted):
            if view in FORBIDDEN_VIEW_MENUS or perm in FORBIDDEN_PERMISSIONS:
                continue
            pvm = sm.find_permission_view_menu(perm, view)
            if pvm is None:
                skipped.append(f"{perm} on {view}")
                continue
            pvms.append(pvm)

        database = db.session.query(Database).filter_by(database_name=ANALYTICS_DATABASE).one_or_none()
        if database is not None:
            pvm = sm.find_permission_view_menu("database_access", database.perm)
            if pvm is not None:
                pvms.append(pvm)

        role.permissions = pvms
        db.session.commit()
        print(f"bootstrap-roles: {GUEST_ROLE} holds {len(pvms)} permission(s)")
        if skipped:
            print(f"bootstrap-roles: not present in this Superset (skipped): {', '.join(skipped)}")

        username = (os.environ.get("SUPERSET_SERVICE_USERNAME") or "").strip()
        password = os.environ.get("SUPERSET_SERVICE_PASSWORD") or ""
        if not username or not password:
            print("bootstrap-roles: SUPERSET_SERVICE_USERNAME/PASSWORD unset; no service account", file=sys.stderr)
            return 0
        if len(password) < 16:
            print("bootstrap-roles: SUPERSET_SERVICE_PASSWORD must be at least 16 characters", file=sys.stderr)
            return 1
        admin = sm.find_role("Admin")
        user = sm.find_user(username=username)
        if user is None:
            created = sm.add_user(
                username,
                "OpenSteward",
                "Service",
                os.environ.get("SUPERSET_SERVICE_EMAIL") or f"{username}@opensteward.invalid",
                admin,
                password=password,
            )
            if not created:
                print(f"bootstrap-roles: could not create service account {username}", file=sys.stderr)
                return 1
            print(f"bootstrap-roles: created service account {username}")
        else:
            sm.reset_password(user.id, password)
            if admin not in user.roles:
                user.roles = [*user.roles, admin]
                db.session.commit()
            print(f"bootstrap-roles: service account {username} is up to date")
    return 0


if __name__ == "__main__":
    sys.exit(main())

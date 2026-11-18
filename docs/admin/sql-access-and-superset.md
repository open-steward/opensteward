> [← Admin console](./README.md)

# SQL access and Superset

Read-only Postgres logins for BI tools (`/sql-access`), and embedded Apache
Superset dashboards on the Dashboards page. Both need the **Postgres backend**.
A deployment on SQLite shows an explanation on this page instead of the
controls, which is why this page has no screenshots.

## What it's for

- **SQL access** gives Metabase, Power BI, Tableau, a notebook or a warehouse
  loader a read-only Postgres login. The login sees one view per resource type,
  only for the tenants and verticals it was granted, with personal data masked
  unless it was created unmasked.
- **Embedded Superset** shows dashboards your analysts build in
  [Apache Superset](https://superset.apache.org/) inside the console. They are
  filtered to each viewer's tenants with row-level security, and the people
  viewing them never sign in to Superset.

To use either, run OpenSteward on Postgres by setting `DATABASE_URL`. To move
an existing SQLite deployment and its data, use `scripts/switch-db.sh`; see
[switching databases](../operations/switching-databases.md). On SQLite, use
[destinations](./destinations.md) to get data out instead.

## Who can use it

- **SQL access** needs **`sql_access:manage`** (admins by default).
  - Provisioning the views needs access to every tenant.
  - Creating an unmasked login, or seeing one, also needs `data:read_pii`.
  - The view catalog on the page needs `data:read`.
- **Superset dashboards** need **`dashboards:view`**.
  - Choosing who sees each one needs **`dashboards:share_all`**, which counts
    only for a user who can see every tenant.

## What you can do

### SQL access

- **Check the status.** The status card shows:
  - the backend and database;
  - the **mode**: *managed* means OpenSteward creates the roles and views
    itself, using `ANALYTICS_ADMIN_DATABASE_URL`; *manual* means an operator
    runs a script;
  - the views' version and whether they are up to date;
  - the read host that BI tools should use;
  - the masked and unmasked schemas;
  - any warnings.
- **Provision the views.**
  - In managed mode, press **Provision now**, **Update views** or
    **Re-provision**.
  - In manual mode, the page shows a **Provisioning script**. Copy it and run
    it as a role with `CREATEROLE`. It is one transaction and safe to re-run.
- **Create a login** with **New login**. Choose:
  - a label, which becomes part of the username;
  - the tenants and verticals it may see;
  - an optional expiry date and a connection limit;
  - optionally **unmasked** (with `data:read_pii`).

  The password is shown **once**, on the next page. Store it in your BI tool or
  secret manager straight away. OpenSteward doesn't keep it.
- **Manage logins.** The list shows each login's scope, whether it is masked,
  its expiry, when it was last rotated, and its status.
  - **Rotate** sets a new password and ends open sessions.
  - **Revoke** disables the login for good.
- **Browse the catalog.** Every view a login can read is listed, with each
  column's type, masked type, classification and mask.

### Embedded Superset dashboards

When the deployment runs Superset, the [Dashboards](./dashboards.md) page gets
a **Custom dashboards (Superset)** section.

- **Open a dashboard.** It appears inside the console, filtered to the tenants
  you may see. Nothing you do there can reach data outside your scope or
  unmask personal data.
- **Choose who sees it** (`dashboards:share_all`). On the dashboard's page,
  **Change** opens its sharing page. Share it with everyone (the default) or
  with people who have access to chosen tenants. You can also pin it to some
  tenants, so its charts show only their data.
- **Build dashboards in Superset itself.** Authors sign in to Superset with
  your IdP (OIDC) or a local account. A dashboard shows up in the console once
  the `superset-bootstrap` job has registered it.

In Docker Compose, Superset and a Postgres for it come from the optional
`analytics` profile, together with the example overlay
`docker-compose.analytics.example.yml`. Superset listens on
`http://localhost:8088`.

## Related docs

- [Read-only SQL access guide](../integrate/sql-access.md): views, columns,
  masking, scope and BI tool setup.
- [Postgres analytics setup](../deployment/postgres-analytics.md): managed and
  manual mode, read replicas, backups and upgrades.
- [Embedded Superset](../deployment/superset.md): architecture, security model,
  Compose and Helm.
- [Switching databases](../operations/switching-databases.md): SQLite to
  Postgres, with the data.
- [Architecture: data access, embedded Superset](../architecture/data-access.md#embedded-superset-optional-postgres-only).

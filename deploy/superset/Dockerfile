# Apache Superset for OpenSteward's `analytics` compose profile.
#
# The official image (`apache/superset:<version>`, the "lean" build) ships no
# database drivers, and both Superset's metadata database and the OpenSteward
# analytics views are Postgres. Pin both the base image and the driver; bump
# them together with docs/deployment/superset.md.
FROM apache/superset:6.1.0

USER root
RUN . /app/.venv/bin/activate \
 && uv pip install --no-cache psycopg2-binary==2.9.9
COPY superset_config.py /app/pythonpath/superset_config.py
COPY bootstrap-roles.py /app/opensteward/bootstrap-roles.py
USER superset

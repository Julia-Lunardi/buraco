-- One-time, per environment, after the FIRST `terraform apply` has created the
-- database (buraco_de / buraco_pr) and the app identity (ca-buraco-de-id / -pr-id).
-- From Salvie's CONSOLIDATION_PLAN.md §2.3, which worked on the same shared server.
--
-- Why: the app signs in to psql-woddie-de with an Entra token as its own identity.
-- That identity must be a NON-admin principal owning only its own database. A
-- server-level Entra admin is effectively superuser over every database on the
-- server, which would let buraco reach woddie's and salvie's data.
--
-- Run as YOUR Entra admin on the server (pgadmin cannot call pgaadauth_*):
--
--   OID=$(az identity show -g rg-buraco-de -n ca-buraco-de-id --query principalId -o tsv)
--   export PGPASSWORD=$(az account get-access-token \
--       --resource https://ossrdbms-aad.database.windows.net --query accessToken -o tsv)
--   psql "host=psql-woddie-de.postgres.database.azure.com dbname=postgres sslmode=require \
--         user=<your Entra admin principal name>" \
--        -v identity=ca-buraco-de-id -v oid="$OID" -v db=buraco_de \
--        -f infra/scripts/managed_identity_db_grants.sql
--
-- Repeat with ca-buraco-pr-id / buraco_pr for production.

SELECT pgaadauth_create_principal_with_oid(:'identity', :'oid', 'service', false, false);
ALTER DATABASE :"db" OWNER TO :"identity";
GRANT CONNECT ON DATABASE :"db" TO :"identity";
-- Postgres lets PUBLIC connect to every database by default; isolation on a shared
-- server is not automatic.
REVOKE CONNECT ON DATABASE :"db" FROM PUBLIC;

-- Postgres 15+ no longer lets PUBLIC create in schema public: hand it to the app so
-- Alembic (running as the identity at container start) can create the tables.
\connect :db
ALTER SCHEMA public OWNER TO :"identity";

-- Check: datacl must list the identity, and the owner must be the identity.
SELECT datname, pg_get_userbyid(datdba) AS owner, datacl FROM pg_database WHERE datname = :'db';

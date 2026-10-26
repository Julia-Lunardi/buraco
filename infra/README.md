# Buraco infrastructure (Azure, Terraform)

The same stack as Salvie. Everything costly is **shared with the woddie stack**:

| Shared resource | Name |
|---|---|
| PostgreSQL server | `psql-woddie-de` (databases `buraco_de`, `buraco_pr`) |
| Container registry | `acrwoddiede` (image repo `buraco-backend`) |
| Container Apps environment | `cae-woddie-de` |
| Terraform state | `rg-terraform / stapptfstate / tfstate`, keys `buraco.{de,pr}.terraform.tfstate` |

Buraco adds its own resources per environment:

- the resource group `rg-buraco-{de,pr}`;
- the Key Vault `kv-buraco-{de,pr}`, holding the secrets: `secret-key`, `google-client-id` (the **web** id), `google-ios-client-id`, `google-android-client-id`;
- the container app `ca-buraco-{de,pr}`, with the user-assigned identity `ca-buraco-{de,pr}-id`;
- an action group and a request alert.

## Deploying

`.github/workflows/deploy.yml` deploys `de` from the `de` branch and `pr` from `main`. It does nothing until the repository variable `AZURE_READY=true` is set.

1. **Phase 1:** a targeted apply of the resource group, Key Vault, database and role assignments. The Key Vault secrets are read, so they must already exist.
2. The image is built and pushed.
3. **Phase 2:** a full apply. The container runs `alembic upgrade head` before starting, as the managed identity, with no database password.

**The first deploy of each environment fails at the health check, and that is expected.** The identity it creates has no rights on the database yet. To fix it:

1. Run `scripts/managed_identity_db_grants.sql`. It registers the identity as a **non-admin** principal owning only its own database, and revokes CONNECT from PUBLIC.
2. Re-run the workflow.

## Constraints

- **`max_replicas` = 1** (a validation rule enforces it). Live tables keep their WebSocket connections and bot cover in one process (`backend/app/realtime.py`).
- **No `moved` blocks.** They abort `terraform plan -target` (Salvie, 28.07.2026).
- **Never ignore `*.tfvars`.** The workflow reads `variables/` from the checkout. Salvie's CI failed until this was fixed.
- **The custom domain and TLS are not managed by Terraform.** Bind them by hand after the first apply (see the runbook).

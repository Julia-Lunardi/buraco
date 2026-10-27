environment  = "pr"
db_name      = "buraco_pr"
min_replicas = 1 # keep one replica warm in production, as Salvie does
# Object id of the pr GitHub Actions service principal (runbook: OIDC app registrations).
github_actions_sp_object_id = "d931c4af-cdfd-4046-b406-a10ab3a72d47"
# Your own user object id (az ad signed-in-user show). Kept here, not passed with -var, so that
# CI keeps your Key Vault Secrets Officer role instead of planning to remove it.
terraform_operator_object_id = "f3cc12ae-8f5e-4e4d-bcb7-9f5a62f696e5"

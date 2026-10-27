environment = "de"
db_name     = "buraco_de"
# Object id of the de GitHub Actions service principal (runbook: OIDC app registrations).
github_actions_sp_object_id = "b761fee5-c3a0-4a42-b0b3-bd6349da8e57"
# Your own user object id (az ad signed-in-user show). Kept here, not passed with -var, so that
# CI keeps your Key Vault Secrets Officer role instead of planning to remove it.
terraform_operator_object_id = "f3cc12ae-8f5e-4e4d-bcb7-9f5a62f696e5"

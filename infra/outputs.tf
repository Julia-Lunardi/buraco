output "resource_group_name" {
  value = module.resource_group.name
}

output "acr_login_server" {
  value = local.acr_login_server
}

output "container_app_name" {
  value = module.container_app.app_name
}

output "container_app_url" {
  description = "The backend URL: EXPO_PUBLIC_API_URL in mobile/eas.json for this environment."
  value       = "https://${module.container_app.app_fqdn}"
}

output "postgres_fqdn" {
  value = local.db_server_fqdn
}

output "app_identity" {
  description = "Name and object id for the one-time database grant (scripts/managed_identity_db_grants.sql)."
  value = {
    name         = local.app_identity_name
    principal_id = module.container_app.principal_id
  }
}

variable "key_vault_id" {
  type = string
}
variable "name" {
  type = string
}

data "azurerm_key_vault_secret" "key_vault_secret" {
  name         = var.name
  key_vault_id = var.key_vault_id
}

output "value" {
  value     = data.azurerm_key_vault_secret.key_vault_secret.value
  sensitive = true
}

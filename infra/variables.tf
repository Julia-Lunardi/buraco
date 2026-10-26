variable "solution_name" {
  description = "Short identifier used in every resource name."
  default     = "buraco"
}

variable "environment" {
  description = "Deployment environment. Matches the variables/<env>.tfvars suffix (de, pr)."
  type        = string
}

variable "location" {
  description = "Azure region for all resources."
  default     = "northeurope"
}

variable "apple_bundle_id" {
  description = "Audience of Apple identity tokens; must equal the app's bundle id."
  type        = string
  default     = "com.buraco.app"
}

variable "db_admin_username" {
  description = "PostgreSQL administrator login (only used when this stack creates its own server)."
  default     = "pgadmin"
}

variable "db_sku_name" {
  description = "PostgreSQL flexible server SKU (only used when this stack creates its own server)."
  default     = "B_Standard_B1ms"
}

variable "alert_email" {
  description = "List of email addresses for monitoring alerts."
  type        = list(string)
  default     = []
}

variable "min_replicas" {
  description = "Minimum Container App replicas (0 allows scale-to-zero)."
  type        = number
  default     = 0
}

variable "max_replicas" {
  description = <<-EOT
    Maximum Container App replicas. Keep at 1: live tables hold their WebSocket
    connections and bot cover in one process (backend/app/realtime.py). Scaling out
    first needs a shared channel such as Postgres LISTEN/NOTIFY.
  EOT
  type        = number
  default     = 1

  validation {
    condition     = var.max_replicas == 1
    error_message = "Live tables need a single replica until app/realtime.py gets a shared channel."
  }
}

variable "github_actions_sp_object_id" {
  type        = string
  description = "Object ID of this environment's GitHub Actions service principal."
  default     = ""
}

variable "terraform_operator_object_id" {
  type        = string
  description = "Object ID of the user running Terraform locally."
  default     = ""
}

variable "cae_name" {
  type        = string
  description = "Existing Container Apps Environment (shared with woddie; Azure only offers CAEs in some regions)."
  default     = "cae-woddie-de"
}

variable "cae_resource_group_name" {
  type        = string
  description = "Resource group of the Container Apps Environment."
  default     = "rg-woddie-de"
}

variable "image_tag" {
  description = "Full image reference for the backend container."
  type        = string
  default     = "mcr.microsoft.com/azuredocs/containerapps-helloworld:latest"
}

# ---------------------------------------------------------------------------
# Shared infrastructure owned by the woddie stack. When empty, this stack falls
# back to creating its own server and registry.
# ---------------------------------------------------------------------------

variable "shared_db_server_name" {
  description = "Existing PostgreSQL Flexible Server to reuse."
  type        = string
  default     = ""
}

variable "shared_db_resource_group" {
  description = "Resource group of the shared PostgreSQL server."
  type        = string
  default     = ""
}

variable "db_name" {
  description = "Database name; must be unique on the shared server."
  type        = string
  default     = "buraco"
}

variable "shared_acr_name" {
  description = "Existing Container Registry to reuse."
  type        = string
  default     = ""
}

variable "shared_acr_resource_group" {
  description = "Resource group of the shared Container Registry."
  type        = string
  default     = ""
}

variable "resource_group_name" {
  type = string
}
variable "location" {
  type = string
}
variable "environment_name" {
  type = string
}
variable "environment_resource_group_name" {
  type = string
}
variable "app_name" {
  type = string
}
variable "acr_login_server" {
  type = string
}
variable "acr_id" {
  type        = string
  description = "Resource ID of the container registry (for the AcrPull role assignment)."
}
variable "database_url" {
  type      = string
  sensitive = true
}
variable "secret_key" {
  type      = string
  sensitive = true
}
variable "google_client_id" {
  type      = string
  sensitive = true
}
variable "google_ios_client_id" {
  type      = string
  sensitive = true
}
variable "google_android_client_id" {
  type      = string
  sensitive = true
}
variable "apple_bundle_id" {
  type = string
}
variable "min_replicas" {
  type    = number
  default = 0
}
variable "max_replicas" {
  type    = number
  default = 1
}
variable "cpu" {
  type    = number
  default = 0.25
}
variable "memory" {
  type    = string
  default = "0.5Gi"
}
variable "target_port" {
  type    = number
  default = 8000
}
variable "image_tag" {
  type        = string
  description = "Full image reference for the container (e.g. acrwoddiede.azurecr.io/buraco-backend:sha)."
}
variable "app_environment" {
  type    = string
  default = "production"
}

data "azurerm_container_app_environment" "existing" {
  name                = var.environment_name
  resource_group_name = var.environment_resource_group_name
}

resource "azurerm_user_assigned_identity" "app" {
  name                = "${var.app_name}-id"
  resource_group_name = var.resource_group_name
  location            = var.location
}

# The app's identity pulls images from the registry (no ACR admin credentials).
resource "azurerm_role_assignment" "acr_pull" {
  scope                = var.acr_id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_user_assigned_identity.app.principal_id
}

resource "azurerm_container_app" "app" {
  name                         = var.app_name
  container_app_environment_id = data.azurerm_container_app_environment.existing.id
  resource_group_name          = var.resource_group_name
  revision_mode                = "Single"

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.app.id]
  }

  registry {
    server   = var.acr_login_server
    identity = azurerm_user_assigned_identity.app.id
  }

  secret {
    name  = "database-url"
    value = var.database_url
  }
  secret {
    name  = "secret-key"
    value = var.secret_key
  }
  secret {
    name  = "google-client-id"
    value = var.google_client_id
  }
  secret {
    name  = "google-ios-client-id"
    value = var.google_ios_client_id
  }
  secret {
    name  = "google-android-client-id"
    value = var.google_android_client_id
  }

  template {
    min_replicas = var.min_replicas
    max_replicas = var.max_replicas

    container {
      name   = "api"
      image  = var.image_tag
      cpu    = var.cpu
      memory = var.memory

      env {
        name        = "DATABASE_URL"
        secret_name = "database-url"
      }
      env {
        name        = "SECRET_KEY"
        secret_name = "secret-key"
      }
      env {
        name        = "GOOGLE_CLIENT_ID"
        secret_name = "google-client-id"
      }
      env {
        name        = "GOOGLE_IOS_CLIENT_ID"
        secret_name = "google-ios-client-id"
      }
      env {
        name        = "GOOGLE_ANDROID_CLIENT_ID"
        secret_name = "google-android-client-id"
      }
      env {
        name  = "APPLE_BUNDLE_ID"
        value = var.apple_bundle_id
      }
      env {
        name  = "ENVIRONMENT"
        value = var.app_environment
      }
      # AZURE_CLIENT_ID selects the user-assigned identity for the DB token and the
      # ACR pull; DB_USE_MANAGED_IDENTITY makes the app and Alembic use Entra tokens.
      env {
        name  = "AZURE_CLIENT_ID"
        value = azurerm_user_assigned_identity.app.client_id
      }
      env {
        name  = "DB_USE_MANAGED_IDENTITY"
        value = "true"
      }

      liveness_probe {
        transport = "HTTP"
        port      = var.target_port
        path      = "/health"
      }
    }
  }

  # Container Apps ingress passes WebSockets through (live tables use /tables/{id}/ws).
  ingress {
    external_enabled = true
    target_port      = var.target_port
    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }

  lifecycle {
    ignore_changes = [tags]
  }

  # Role assignments propagate asynchronously; without this the app can be created
  # before it may pull the image and the revision never becomes ready (Salvie).
  depends_on = [azurerm_role_assignment.acr_pull]
}

output "app_id" {
  value = azurerm_container_app.app.id
}
output "app_name" {
  value = azurerm_container_app.app.name
}
output "app_fqdn" {
  value = azurerm_container_app.app.ingress[0].fqdn
}
output "principal_id" {
  value = azurerm_user_assigned_identity.app.principal_id
}

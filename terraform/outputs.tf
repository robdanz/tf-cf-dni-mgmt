output "worker_url" {
  description = "Worker URL (API + frontend)"
  value       = "https://${var.worker_name}.${var.cloudflare_workers_subdomain}.workers.dev"
}

output "access_app_id" {
  description = "Access application ID — attach policies to this in the Zero Trust dashboard"
  value       = cloudflare_access_application.dni_mgmt.id
}

output "access_app_aud" {
  description = "Access application AUD tag"
  value       = cloudflare_access_application.dni_mgmt.aud
}

output "worker_api_token_id" {
  description = "Worker runtime API token ID (for reference/rotation)"
  value       = cloudflare_api_token.worker.id
}

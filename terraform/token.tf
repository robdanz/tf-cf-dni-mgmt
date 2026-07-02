resource "cloudflare_api_token" "worker" {
  name = "${var.worker_name}-runtime"

  policy {
    permission_groups = [
      data.cloudflare_api_token_permission_groups.all.account["Teams Write"],
      data.cloudflare_api_token_permission_groups.all.account["Intel Read"],
    ]
    resources = {
      "com.cloudflare.api.account.${var.cloudflare_account_id}" = "*"
    }
  }
}

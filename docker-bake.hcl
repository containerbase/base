variable "OWNER" {
  default = "containerbase"
}
variable "FILE" {
  default = "buildpack"
}
variable "TAG" {
  default = "latest"
}

variable "APT_HTTP_PROXY" {
  default = ""
}

group "default" {
  targets = ["build-docker"]
}

group "push" {
  targets = ["push-ghcr", "push-hub", "push-cache"]
}

group "test" {
  targets = ["build-test"]
}

group "test-distro" {
  targets = ["build-distro"]
}


target "settings" {
  context = "."
  args = {
    APT_HTTP_PROXY = "${APT_HTTP_PROXY}"
  }
}

target "cache" {
  cache-from = [
    "type=registry,ref=ghcr.io/${OWNER}/cache:${FILE}",
    "type=registry,ref=ghcr.io/${OWNER}/cache:${FILE}-${TAG}",
  ]
}

target "push-cache" {
  inherits = ["settings", "cache"]
  output   = ["type=registry"]
  tags = [
    "ghcr.io/${OWNER}/cache:${FILE}-${TAG}",
    "ghcr.io/${OWNER}/cache:${FILE}",
  ]
  cache-to = ["type=inline,mode=max"]
}

target "build-docker" {
  inherits = ["settings", "cache"]
  output   = ["type=docker"]
  tags = [
    "ghcr.io/${OWNER}/${FILE}",
    "ghcr.io/${OWNER}/${FILE}:${TAG}",
    "${OWNER}/${FILE}:${TAG}",
    "${OWNER}/${FILE}",
  ]
}

target "build-distro" {
  inherits = ["settings"]
  dockerfile = "Dockerfile.${TAG}"
  tags = [
    "${OWNER}/${FILE}:${TAG}"
  ]
}

target "build-test" {
  inherits = ["settings"]
  context ="./test/${TAG}"
}

target "push-ghcr" {
  inherits = ["settings", "cache"]
  output   = ["type=registry"]
  tags = [
    "ghcr.io/${OWNER}/${FILE}",
    "ghcr.io/${OWNER}/${FILE}:${TAG}",
  ]
}

target "push-hub" {
  inherits = ["settings", "cache"]
  output   = ["type=registry"]
  tags     = ["${OWNER}/${FILE}", "${OWNER}/${FILE}:${TAG}"]
}

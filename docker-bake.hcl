variable "OWNER" {
  default = "containerbase"
}
variable "FILE" {
  default = "base"
}
variable "TAG" {
  default = "latest"
}
variable "CONTAINERBASE_VERSION" {
  default = "unknown"
}

variable "APT_HTTP_PROXY" {
  default = ""
}

variable "CACHE_WEEK" {
  default = ""
}

variable "CONTAINERBASE_DEBUG" {
  default = ""
}

variable "GITHUB_TOKEN" {
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
    APT_HTTP_PROXY    = "${APT_HTTP_PROXY}"
    CONTAINERBASE_DEBUG   = "${CONTAINERBASE_DEBUG}"
    CONTAINERBASE_VERSION = "${CONTAINERBASE_VERSION}"
    GITHUB_TOKEN      = "${GITHUB_TOKEN}"
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

target "build" {
  inherits = ["settings", "cache"]
  tags = [
    "ghcr.io/${OWNER}/${FILE}",
    "ghcr.io/${OWNER}/${FILE}:${TAG}",
    "${OWNER}/${FILE}:${TAG}",
    "${OWNER}/${FILE}"
  ]
}

target "build-docker" {
  inherits = ["settings", "cache"]
  output   = ["type=docker"]
  tags = [
    "ghcr.io/${OWNER}/${FILE}",
    "ghcr.io/${OWNER}/${FILE}:${TAG}",
    "${OWNER}/${FILE}:${TAG}",
    "${OWNER}/${FILE}",
    "containerbase/test"
  ]
}

target "build-distro" {
  inherits   = ["settings"]
  dockerfile = "./test/Dockerfile.${TAG}"
}

target "build-test" {
  inherits = ["settings"]
  context  = "./test/${TAG}"
}

target "test-arm64" {
  inherits   = ["settings"]
  platforms  = ["linux/arm64"]
  dockerfile = "./test/Dockerfile.arm64"
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


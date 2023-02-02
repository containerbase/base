variable "OWNER" {
  default = "containerbase"
}
variable "FILE" {
  default = "base"
}
variable "TAG" {
  default = "latest"
}
variable "BUILDPACK_VERSION" {
  default = "unknown"
}

variable "APT_HTTP_PROXY" {
  default = ""
}

variable "CACHE_WEEK" {
  default = ""
}

variable "BUILDPACK_DEBUG" {
  default = ""
}

variable "GITHUB_TOKEN" {
  default = ""
}

group "default" {
  targets = ["build-docker"]
}

group "push" {
  targets = ["push-ghcr", "push-hub", "push-legacy", "push-cache"]
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
    BUILDPACK_DEBUG   = "${BUILDPACK_DEBUG}"
    BUILDPACK_VERSION = "${BUILDPACK_VERSION}"
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
  inherits   = ["settings"]
  dockerfile = "./test/Dockerfile.${TAG}"
}

target "build-test" {
  inherits = ["settings"]
  context  = "./test/${TAG}"
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

// TODO: remove on next major
target "push-legacy" {
  inherits = ["settings", "cache"]
  output   = ["type=registry"]
  tags = [
    "ghcr.io/${OWNER}/buildpack",
    "ghcr.io/${OWNER}/buildpack:${TAG}",
    "${OWNER}/buildpack",
    "${OWNER}/buildpack:${TAG}"
  ]
}

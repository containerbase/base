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

group "test" {
  targets = ["build-test", "build-arm64"]
}

group "test-distro" {
  targets = ["build-distro"]
}


target "settings" {
  context = "."
  args = {
    APT_HTTP_PROXY        = "${APT_HTTP_PROXY}"
    CONTAINERBASE_DEBUG   = "${CONTAINERBASE_DEBUG}"
    CONTAINERBASE_VERSION = "${CONTAINERBASE_VERSION}"
    GITHUB_TOKEN          = "${GITHUB_TOKEN}"
  }
  cache-from = [
    "type=registry,ref=ghcr.io/${OWNER}/cache:${FILE}",
  ]
}

target "build" {
  inherits = ["settings"]
  tags = [
    "ghcr.io/${OWNER}/${FILE}",
    "ghcr.io/${OWNER}/${FILE}:${TAG}",
    "${OWNER}/${FILE}:${TAG}",
    "${OWNER}/${FILE}"
  ]
}

target "build-docker" {
  inherits = ["settings"]
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
  dockerfile = "./test/${TAG}/Dockerfile"
}

target "build-arm64" {
  inherits   = ["settings"]
  platforms  = ["linux/arm64"]
  dockerfile = "./test/${TAG}/Dockerfile.arm64"
}

target "push" {
  inherits = ["settings"]
  output   = ["type=registry"]
  cache-to = ["type=registry,ref=ghcr.io/${OWNER}/${FILE},mode=max,image-manifest=true,ignore-error=true"]
  tags     = [
    "ghcr.io/${OWNER}/${FILE}",
    "ghcr.io/${OWNER}/${FILE}:${TAG}",
     "${OWNER}/${FILE}",
     "${OWNER}/${FILE}:${TAG}",
  ]
}

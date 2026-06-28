# Vizyto Booking Widget — release & deploy
#
#   make release           # auto-bump patch od ostatniego taga v* (lub v1.0.0)
#   make release V=1.2.0   # konkretna wersja -> tag v1.2.0 + push -> CI deployuje
#   make deploy            # lokalny build + wrangler deploy (wymaga CLOUDFLARE_API_TOKEN)
#   make build             # tylko build + złożenie deploy/
#   make show-version      # ostatni wydany tag
#
# CI (.github/workflows/deploy.yml) reaguje na tag v* i publikuje
# https://widget.vizyto.com/v1/widget.js
SHELL := /bin/bash
.DEFAULT_GOAL := help
.PHONY: help build deploy show-version release

help: ## Pokaż dostępne komendy
	@grep -hE '^[a-zA-Z0-9_-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*## "}{printf "  \033[36m%-14s\033[0m %s\n",$$1,$$2}'

build: ## Zbuduj widget + złóż katalog deploy/
	pnpm build:cdn

deploy: ## Lokalny deploy na Cloudflare (wymaga CLOUDFLARE_API_TOKEN)
	pnpm deploy

show-version: ## Pokaż ostatni wydany tag
	@git tag --list 'v*' --sort=-v:refname | head -1 | grep . || echo "<brak>"

release: ## Tag + push wydania; CI deployuje (V=X.Y.Z opcjonalne)
	@bash scripts/release.sh "$(V)"

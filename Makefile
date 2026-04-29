SHELL := /bin/bash
.DEFAULT_GOAL := help

# ---------- 基礎指令 ----------
.PHONY: help up down restart logs ps build

help: ## 列出所有指令
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}'

up: ## 啟動所有 service
	docker compose up -d

down: ## 停止所有 service（保留 volume）
	docker compose down

restart: ## 重啟 api / web / worker
	docker compose restart api web worker

logs: ## 跟 api 的 log
	docker compose logs -f api

logs-web: ## 跟 web 的 log
	docker compose logs -f web

logs-all: ## 跟所有 service 的 log
	docker compose logs -f

ps: ## 列出 service 狀態
	docker compose ps

build: ## 重新 build api / web image
	docker compose build api web worker

# ---------- DB ----------
.PHONY: migrate migration reset-db psql seed

migrate: ## 套用 alembic migration
	docker compose exec api alembic upgrade head

migration: ## 產生新 migration  使用方式: make migration m="add foo"
	docker compose exec api alembic revision --autogenerate -m "$(m)"

reset-db: ## 砍掉 DB volume 重來
	docker compose down -v
	docker compose up -d postgres redis
	@echo "等 postgres 起來..."
	@sleep 3
	docker compose up -d api worker web
	@sleep 3
	$(MAKE) migrate
	$(MAKE) seed

psql: ## 進 postgres CLI
	docker compose exec postgres psql -U quiver -d quiver

seed: ## 塞 demo 資料（Phase 1 暫時是 noop）
	@echo "Phase 1 暫無 seed 資料"

# ---------- 開發 ----------
.PHONY: ngrok-url shell-api shell-web test lint typecheck

ngrok-url: ## 印出 ngrok 對外 URL（webhook 用）
	@curl -s http://localhost:4040/api/tunnels | python3 -c "import sys, json; d=json.load(sys.stdin); print(d['tunnels'][0]['public_url'] if d.get('tunnels') else 'ngrok 還沒起來')"

shell-api: ## 進 api container shell
	docker compose exec api bash

shell-web: ## 進 web container shell
	docker compose exec web sh

test: ## 跑後端測試
	docker compose exec api pytest -v

lint: ## ruff + mypy
	docker compose exec api ruff check .
	docker compose exec api mypy app

typecheck: ## 前端 type check
	docker compose exec web npx tsc --noEmit

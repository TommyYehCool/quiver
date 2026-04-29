# ADR-0001 — 技術棧選擇

**日期**：2026-04-29  
**狀態**：Accepted

## Context

要從零打造 Quiver MVP（USDT 託管錢包、不上鏈內部互轉、平台代付 TRX）。需要：
- 後端要能處理 ledger（精準金額）、async webhook、background job
- 前端要好看、雙語、深色模式、響應式
- Mobile 要雙平台、生物辨識
- 全部要能本機 docker compose 起來

## Decision

| 層 | 選型 | 理由 |
|---|---|---|
| 後端 | FastAPI + SQLAlchemy 2 async + Postgres + Redis + arq | async-first、Pydantic validation、生態成熟 |
| 套件管理 | uv | 比 poetry / pip 快 10x，鎖定檔管理直觀 |
| ORM | SQLAlchemy 2.x async + alembic | 業界標準，async + sync 雙介面 |
| 鏈整合 | Tatum REST | 不用自己跑 TRON node、有 TRC20 fee delegation |
| 前端 | Next.js 14 App Router + Tailwind + shadcn/ui | RSC + 強型別 + 美觀預設 |
| 狀態 | TanStack Query + Zustand | 標準組合，server state vs client state 分離 |
| Mobile | Flutter | 雙平台單 codebase、UI 一致、生物辨識成熟 |
| 部署 | Docker Compose（dev） | demo 階段不需要 k8s |

## Consequences

- 後端與 mobile 走兩種語言（Python + Dart），無法共享業務邏輯，只能透過 OpenAPI codegen 共享型別
- Web 與 mobile 也是兩種語言（TS + Dart），i18n 文案需要同步機制（自動轉 .arb）
- uv 比較新，但已穩定
- Tatum 是付費服務，每月 free tier 10k requests 對 demo 夠

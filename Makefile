.PHONY: dev backend frontend test seed docker-up docker-down docker-build

# Local dev — runs both in parallel
dev:
	$(MAKE) backend & $(MAKE) frontend & wait

backend:
	cd backend && ../.venv/bin/uvicorn main:app --reload --port 8000

frontend:
	cd frontend && npm run dev

test:
	cd backend && ../.venv/bin/pytest tests/ -v

seed:
	@echo "Seed data already in backend/data/"

# Docker
docker-build:
	docker compose build

docker-up:
	docker compose up --build

docker-down:
	docker compose down

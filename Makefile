.PHONY: dev backend frontend test seed

dev: backend frontend

backend:
	cd backend && ../.venv/bin/uvicorn main:app --reload --port 8000

frontend:
	cd frontend && npm run dev

test:
	cd backend && ../.venv/bin/pytest tests/ -v

seed:
	@echo "Seed data already in backend/data/"

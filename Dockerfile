# Multi-stage Dockerfile for Storyteller Application (Frontend + FastAPI Backend)
FROM node:20-slim AS frontend-builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM python:3.11-slim
WORKDIR /app

ENV PYTHONUNBUFFERED=1
ENV PORT=8000

# Install dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend server code, system prompt template, and built frontend dist
COPY server/ ./server/
COPY system.txt ./system.txt
COPY --from=frontend-builder /app/dist ./dist

EXPOSE 8000

CMD ["python3", "server/server.py"]

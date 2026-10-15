# Component 3 (Express). Build from the repo root:
#   docker build -f infra/docker/node-audit.Dockerfile -t audit .
FROM node:20-slim
WORKDIR /app
COPY backend/Blockchain-Auditability/backend/package*.json ./
RUN npm ci --omit=dev
COPY backend/Blockchain-Auditability/backend/ ./
USER node
# Cloud Run injects PORT (index.js reads it).
CMD ["node", "src/index.js"]

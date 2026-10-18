# Component 3 (Express) with its own EVM chain. Build from the repo root:
#   docker build -f infra/docker/node-audit.Dockerfile -t audit .
#
# The container runs a Hardhat node and deploys AuditRegistry.sol to it at startup, so every
# anchored decision is a real contract transaction with a receipt and a block number, not a
# hash kept in a JavaScript Map. The chain lives as long as the instance, exactly like the
# off-chain records it commits to. If the chain cannot start, the API still starts and says
# so (BlockchainService's fallback), rather than taking the audit trail down with it.
FROM node:20-slim
WORKDIR /app

ENV HARDHAT_DISABLE_TELEMETRY_PROMPT=true

# The chain first: its dependencies change far less often than the API.
COPY backend/Blockchain-Auditability/blockchain/package*.json ./blockchain/
RUN cd blockchain && (npm ci --no-audit --no-fund || npm install --no-audit --no-fund)
COPY backend/Blockchain-Auditability/blockchain/hardhat.config.js ./blockchain/
COPY backend/Blockchain-Auditability/blockchain/contracts ./blockchain/contracts
COPY backend/Blockchain-Auditability/blockchain/scripts ./blockchain/scripts
# Compile at build time: startup then needs no compiler download.
RUN cd blockchain && npx hardhat compile

COPY backend/Blockchain-Auditability/backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev --no-audit --no-fund
COPY backend/Blockchain-Auditability/backend/ ./backend/
COPY infra/docker/audit-start.sh /app/start.sh

RUN mkdir -p /app/backend/src/config && chown -R node:node /app && chmod +x /app/start.sh
USER node
# Cloud Run injects PORT (index.js reads it).
CMD ["/app/start.sh"]

# ======================
# STAGE 1: BUILD
# ======================
FROM node:20-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    build-essential \
    python3 \
    g++ \
    make \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ======================
# STAGE 2: PRODUCTION
# ======================
FROM node:20-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --system appgroup && useradd --system --gid appgroup appuser

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./

USER appuser

EXPOSE 3000

CMD ["node", "dist/main.js"]

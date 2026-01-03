# ======================
# STAGE 1: BUILD
# ======================
FROM node:20.19.6-alpine3.21 AS builder

WORKDIR /app

RUN apk add --no-cache \
    ca-certificates \
    python3 \
    g++ \
    make

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ======================
# STAGE 2: PRODUCTION
# ======================
FROM node:20.19.6-alpine3.21

LABEL org.opencontainers.image.source="https://github.com/2025-b-dss-wasigo/waisgo-backend"

WORKDIR /app

RUN apk add --no-cache \
    ca-certificates

ENV NODE_ENV=production

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=builder /app/dist ./dist
COPY package*.json ./

RUN npm ci --omit=dev --ignore-scripts

USER appuser

EXPOSE 3000

CMD ["node", "dist/main.js"]

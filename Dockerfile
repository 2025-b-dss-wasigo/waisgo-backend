# ======================
# STAGE 1: BUILD
# ======================
FROM node:20-bullseye-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ======================
# STAGE 2: PRODUCTION
# ======================        
FROM node:20-bullseye-slim

WORKDIR /app

# Crear usuario no-root (SEGURIDAD)
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copiar solo lo necesario
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./

USER appuser

EXPOSE 3000

CMD ["node", "dist/main.js"]

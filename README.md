# WasiGo Backend

Backend de la plataforma de carpooling universitario WasiGo, desarrollado con NestJS y TypeScript.

## Tabla de contenidos
- Descripcion
- Tecnologias
- Requisitos previos
- Instalacion
- Configuracion
- Comandos
- Estructura del proyecto
- API Endpoints
- Base de datos
- Seguridad
- Documentacion tecnica

---

## Descripcion

WasiGo es una plataforma de carpooling para la comunidad universitaria de la EPN. Permite compartir viajes de forma segura y eficiente.

Caracteristicas principales:
- Autenticacion con tokens JWE (cifrados)
- Verificacion de correo institucional (@epn.edu.ec)
- Sistema de rutas y reservas
- Gestion de conductores y vehiculos
- Sistema de calificaciones
- Integracion con PayPal
- Auditoria de acciones

---

## Tecnologias

| Tecnologia | Version | Proposito |
| --- | --- | --- |
| Node.js | 20.x | Runtime |
| NestJS | 11.x | Framework backend |
| TypeScript | 5.x | Lenguaje |
| PostgreSQL | 16 | Base de datos |
| Redis | 7 | Cache y sesiones |
| TypeORM | 0.3.x | ORM |
| Jose | 4.x | Tokens JWE |
| Docker | - | Contenedores |

---

## Requisitos previos
- Node.js >= 20.x
- npm >= 10.x
- Docker y Docker Compose (para servicios locales)
- Git

---

## Instalacion

1) Clonar el repositorio

```bash
git clone https://github.com/tu-usuario/wasigo-backend.git
cd wasigo-backend
```

2) Instalar dependencias

```bash
npm install
```

3) Configurar variables de entorno

```bash
cp .env.template .env
# Editar .env con tus valores
```

4) Levantar servicios (PostgreSQL y Redis)

```bash
docker-compose up -d
```

5) Ejecutar migraciones

```bash
npm run migration:run
```

6) Iniciar el servidor

```bash
npm run start:dev
```

---

## Configuracion

Variables de entorno (.env):

```env
# Configuracion general
NODE_ENV=development
PORT=3000
FRONTEND_URL=http://localhost:4200

# Base de datos
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=wasigo_app
DB_PASSWORD=wasigo_app_pwd
DB_NAME=wasigo
DB_MIGRATION_USERNAME=wasigo_migrator
DB_MIGRATION_PASSWORD=wasigo_migrator_pwd
DB_SSL=false

# JWT (debe ser exactamente 32 caracteres)
JWT_SECRET=tu_secreto_de_32_caracteres_aqui
JWT_EXPIRES_IN=8h

# PayPal
PAYPAL_CLIENT_ID=tu_client_id
PAYPAL_SECRET=tu_secret
PAYPAL_MODE=sandbox
PAYPAL_BASE_URL=https://api-m.sandbox.paypal.com

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=tu_password_redis

# Correo
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USER=tu_correo@gmail.com
MAIL_PASS=tu_app_password
MAIL_FROM="WasiGo <noreply@wasigo.com>"

# Otros
CLEANUP_UNVERIFIED_DAYS=7
```

---

## Comandos

Desarrollo:

```bash
npm run start:dev
```

Tests:

```bash
npm run test
```

---

## Estructura del proyecto

```
src/
  app.module.ts
  main.ts
  config/
  migrations/
  redis/
  modules/
  types/
```

---

## API Endpoints

Documentacion Swagger:

```
http://localhost:3000/api/docs
```

---

## Base de datos

Schemas principales:
- auth
- business
- audit

---

## Seguridad

Resumen de controles:
- Schemas desacoplados con mapeo encriptado (AES-256-GCM)
- Tokens JWE (cifrado A256GCM)
- Rate limiting global
- Helmet para headers de seguridad
- Bcrypt con factor 12 para contrasenas
- Revocacion de tokens via Redis
- Validacion estricta con class-validator
- CORS configurado por origen

Detalle completo en: docs/seguridad.md

---

## Documentacion tecnica

Generar documentacion Compodoc:

```bash
npm run docs:build
```

Servir la documentacion:

```bash
npm run docs:serve
```

La salida queda en `documentation/`.

---

## Licencia

Proyecto privado.

# 🚗 WasiGo Backend

Backend de la plataforma de carpooling universitario **WasiGo**, desarrollado con NestJS y TypeScript.

## 📋 Tabla de Contenidos

- [Descripción](#descripción)
- [Tecnologías](#tecnologías)
- [Requisitos Previos](#requisitos-previos)
- [Instalación](#instalación)
- [Configuración](#configuración)
- [Comandos](#comandos)
- [Estructura del Proyecto](#estructura-del-proyecto)
- [API Endpoints](#api-endpoints)
- [Base de Datos](#base-de-datos)
- [Seguridad](#seguridad)

---

## 📖 Descripción

WasiGo es una plataforma de carpooling diseñada para la comunidad universitaria de la EPN (Escuela Politécnica Nacional). Permite a estudiantes y personal compartir viajes de manera segura y eficiente.

### Características principales:

- ✅ Autenticación con tokens JWE (cifrados)
- ✅ Verificación de correo institucional (@epn.edu.ec)
- ✅ Sistema de rutas y reservas
- ✅ Gestión de conductores y vehículos
- ✅ Sistema de calificaciones
- ✅ Integración con PayPal
- ✅ Auditoría completa de acciones

---

## 🛠 Tecnologías

| Tecnología | Versión | Propósito         |
| ---------- | ------- | ----------------- |
| Node.js    | 20.x    | Runtime           |
| NestJS     | 11.x    | Framework backend |
| TypeScript | 5.x     | Lenguaje          |
| PostgreSQL | 16      | Base de datos     |
| Redis      | 7       | Cache y sesiones  |
| TypeORM    | 0.3.x   | ORM               |
| Jose       | 4.x     | Tokens JWE        |
| Docker     | -       | Contenedores      |

---

## 📦 Requisitos Previos

- **Node.js** >= 20.x
- **npm** >= 10.x
- **Docker** y **Docker Compose** (para servicios locales)
- **Git**

---

## 🚀 Instalación

### 1. Clonar el repositorio

```bash
git clone https://github.com/tu-usuario/wasigo-backend.git
cd wasigo-backend
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Configurar variables de entorno

```bash
cp .env.template .env
# Editar .env con tus valores
```

### 4. Levantar servicios (PostgreSQL y Redis)

```bash
docker-compose up -d
```

### 5. Ejecutar migraciones

```bash
npm run migration:run
```

### 6. Iniciar el servidor

```bash
npm run start:dev
```

---

## ⚙️ Configuración

### Variables de Entorno (.env)

```env
# Configuración general
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

# JWT (DEBE ser exactamente 32 caracteres)
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

# Correo (Gmail ejemplo)
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USER=tu_correo@gmail.com
MAIL_PASS=tu_app_password
MAIL_FROM="WasiGo <noreply@wasigo.com>"

# Otros
CLEANUP_UNVERIFIED_DAYS=7
```

---

## 📜 Comandos

### Desarrollo

```bash
# Iniciar en modo desarrollo (watch)
npm run start:dev

# Iniciar en modo debug
npm run start:debug

# Iniciar en modo producción
npm run start:prod
```

### Build

```bash
# Compilar el proyecto
npm run build

# Limpiar y compilar
rm -rf dist && npm run build
```

### Linting y Formato

```bash
# Ejecutar ESLint con auto-fix
npm run lint

# Formatear código con Prettier
npm run format
```

### Tests

```bash
# Tests unitarios
npm run test

# Tests en modo watch
npm run test:watch

# Tests con cobertura
npm run test:cov

# Tests end-to-end
npm run test:e2e
```

### Migraciones (TypeORM)

```bash
# Generar nueva migración desde cambios en entidades
npm run migration:generate src/migrations/NombreMigracion

# Crear migración vacía
npm run migration:create src/migrations/NombreMigracion

# Ejecutar migraciones pendientes
npm run migration:run

# Revertir última migración
npm run migration:revert
```

### Docker

```bash
# Levantar servicios (PostgreSQL + Redis)
docker-compose up -d

# Ver logs de servicios
docker-compose logs -f

# Detener servicios
docker-compose down

# Detener y eliminar volúmenes (⚠️ borra datos)
docker-compose down -v

# Reconstruir contenedores
docker-compose up -d --build
```

### Producción

```bash
# Build de imagen Docker
docker build -t wasigo-backend .

# Ejecutar contenedor
docker run -p 3000:3000 --env-file .env wasigo-backend
```

---

## 📁 Estructura del Proyecto

```
src/
├── app.module.ts              # Módulo principal
├── main.ts                    # Punto de entrada
├── config/
│   └── env.schema.ts          # Validación de variables de entorno
├── migrations/                # Migraciones de TypeORM
├── redis/                     # Módulo de Redis
│   ├── redis.module.ts
│   └── redis.service.ts
├── modules/
│   ├── admin/                 # Gestión administrativa
│   ├── audit/                 # Logs de auditoría
│   ├── auth/                  # Autenticación (login, registro, reset)
│   │   ├── Guards/            # JweAuthGuard, RolesGuard
│   │   ├── Decorators/        # @Public(), @Roles(), @User()
│   │   └── Models/            # AuthUser, Credential
│   ├── bookings/              # Reservas de viajes
│   ├── business/              # Entidades de negocio
│   ├── common/                # Filtros, tipos compartidos
│   ├── drivers/               # Gestión de conductores
│   ├── mail/                  # Envío de correos
│   ├── otp/                   # Códigos de verificación
│   ├── payments/              # Pagos y payouts
│   ├── ratings/               # Calificaciones
│   ├── routes/                # Rutas de viaje
│   ├── users/                 # Gestión de usuarios
│   └── verification/          # Verificación de cuenta
└── types/                     # Tipos TypeScript globales
```

---

## 🔌 API Endpoints

### Documentación Swagger

Una vez iniciado el servidor, accede a:

```
http://localhost:3000/api/docs
```

### Endpoints Principales

| Método  | Endpoint                    | Descripción                   | Auth |
| ------- | --------------------------- | ----------------------------- | ---- |
| `POST`  | `/api/auth/login`           | Iniciar sesión                | ❌   |
| `POST`  | `/api/auth/forgot-password` | Solicitar reset de contraseña | ❌   |
| `POST`  | `/api/auth/reset-password`  | Cambiar contraseña con token  | ❌   |
| `POST`  | `/api/auth/logout`          | Cerrar sesión                 | ✅   |
| `POST`  | `/api/users/register`       | Registrar nuevo usuario       | ❌   |
| `PATCH` | `/api/users/profile`        | Actualizar perfil             | ✅   |
| `PATCH` | `/api/users/password`       | Cambiar contraseña            | ✅   |
| `POST`  | `/api/verification/send`    | Enviar código OTP             | ✅   |
| `POST`  | `/api/verification/confirm` | Confirmar código OTP          | ✅   |

---

## 🗄 Base de Datos

### Schemas

| Schema     | Propósito                                   |
| ---------- | ------------------------------------------- |
| `auth`     | Usuarios, credenciales                      |
| `business` | Rutas, bookings, drivers, vehicles, ratings |
| `audit`    | Logs de auditoría                           |

### Usuarios de BD

| Usuario           | Rol         | Permisos                       |
| ----------------- | ----------- | ------------------------------ |
| `wasigo_app`      | Aplicación  | SELECT, INSERT, UPDATE, DELETE |
| `wasigo_migrator` | Migraciones | ALL PRIVILEGES                 |

### Diagrama Simplificado

```
auth.legacy_users ←→ auth.credentials
         ↓
business.drivers → business.vehicles
         ↓
business.routes → business.bookings
         ↓
business.ratings
```

---

## 🔒 Seguridad

### Características Implementadas

- ✅ **Tokens JWE** (cifrado A256GCM) en lugar de JWT plano
- ✅ **Rate Limiting** con @nestjs/throttler
- ✅ **Helmet** para headers de seguridad
- ✅ **Bcrypt** con factor 12 para contraseñas
- ✅ **Bloqueo por intentos fallidos** (5 intentos → 15 min)
- ✅ **Revocación de tokens** via Redis
- ✅ **Validación estricta** con class-validator
- ✅ **CORS** configurado
- ✅ **Usuario no-root** en Docker

### Comandos Redis deshabilitados

Por seguridad, los siguientes comandos están deshabilitados en Redis:

- `FLUSHALL`
- `FLUSHDB`
- `CONFIG`

---

## 🧪 Testing

```bash
# Ejecutar todos los tests
npm run test

# Con cobertura
npm run test:cov

# Tests e2e
npm run test:e2e
```

---

## 📝 Scripts Útiles

### Verificar estado de servicios

```bash
# PostgreSQL
docker exec wasigo-postgres pg_isready -U postgres

# Redis
docker exec wasigo-redis redis-cli -a $REDIS_PASSWORD ping
```

### Acceder a PostgreSQL

```bash
docker exec -it wasigo-postgres psql -U postgres -d wasigo
```

### Acceder a Redis

```bash
docker exec -it wasigo-redis redis-cli -a tu_password
```

### Limpiar caché de NestJS

```bash
rm -rf dist node_modules/.cache
npm run build
```

---

## 🤝 Contribución

1. Fork el proyecto
2. Crea tu rama (`git checkout -b feature/nueva-funcionalidad`)
3. Commit tus cambios (`git commit -m 'feat: agregar nueva funcionalidad'`)
4. Push a la rama (`git push origin feature/nueva-funcionalidad`)
5. Abre un Pull Request

---

## 📄 Licencia

Este proyecto es privado y de uso exclusivo para WasiGo.

---

## 👥 Equipo

- **Backend Developer** - Ariel Amaguaña

---

<p align="center">
  Desarrollado con ❤️ para la comunidad EPN
</p>

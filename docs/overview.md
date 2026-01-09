# Documentacion general

Esta documentacion describe la arquitectura, flujos y decisiones de seguridad del backend.
Se genera con Compodoc y se complementa con esta guia general.

## Contenido
- Arquitectura y modulos principales
- Flujo de autenticacion y sesiones
- Controles de seguridad
- Operacion y entorno

## Arquitectura general
El backend usa NestJS y organiza la logica por modulos. La autenticacion y el dominio
de negocio estan desacoplados para reducir riesgo ante fuga de datos.

## Modulos principales
- auth: login, registro, refresh y recuperacion de contrasena.
- business: perfiles y entidades del dominio de negocio.
- drivers, routes, bookings, ratings: funcionalidades del carpooling.
- payments: integracion de pagos y payouts.
- audit: registro de eventos de seguridad.
- identity: mapeo cifrado entre auth y business.
- common: filtros, interceptores, utils y tipos compartidos.

## Flujo de autenticacion (resumen)
1) Login valida credenciales con bcrypt.
2) Se generan tokens JWE (access/refresh).
3) Refresh token se registra en Redis para rotacion y revocacion.
4) Guards validan JWE y revocacion antes de autorizar requests.

## Operacion local
Generar documentacion:
```bash
npm run docs:build
```

Servir documentacion:
```bash
npm run docs:serve
```

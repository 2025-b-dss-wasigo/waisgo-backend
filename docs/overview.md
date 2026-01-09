# Documentacion general

## Objetivo
Brindar una vision general del backend y orientar la lectura de la documentacion.

## Alcance
Cubre la estructura general del proyecto, modulos principales y uso local de la doc.

Descripcion: Esta seccion explica el proposito del backend, su arquitectura a alto nivel
y como navegar la documentacion tecnica.

## Contenido
- Arquitectura y modulos principales
- Flujo de autenticacion y sesiones
- Controles de seguridad
- Operacion local

## Arquitectura general
El backend usa NestJS y organiza la logica por modulos. La identidad de auth y business
esta desacoplada para reducir riesgo ante fuga de datos.

## Modulos principales
- auth: login, registro, refresh y recuperacion de contrasena.
- identity: mapeo cifrado entre auth y business.
- audit: eventos de seguridad y trazabilidad.
- common: filtros, interceptores, utils y tipos compartidos.
- payments: integracion con PayPal y payouts.
- routes, bookings, ratings, drivers, vehicle, business: dominio de carpooling.

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

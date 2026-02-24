# App de cierres semanales (Financiera)

Aplicación web para registrar y visualizar cierres semanales con actualización en tiempo real para socios.

## Qué incluye

- Dashboard con KPIs (capital, ganancia, ROI, último corte).
- Tabla histórica de cierres.
- Gráfico de evolución de capital.
- Formulario para cargar nuevos cierres.
- Actualización en vivo usando Server-Sent Events (SSE).
- Autorización simple para carga de datos vía contraseña compartida.

## Uso

```bash
npm start
```

Abrir `http://localhost:3000`.

## Contraseña de carga

Por defecto usa:

- `cambio2026`

Para cambiarla:

```bash
APP_PASSWORD=tu_clave npm start
```

## API

- `GET /api/summary`
- `GET /api/partners`
- `GET /api/closures`
- `POST /api/closures` (requiere header `x-app-password`)
- `GET /api/stream` (eventos en tiempo real)

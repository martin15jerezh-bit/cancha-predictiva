# DOS Scout Pro

## Arquitectura

La plataforma queda pensada como una app web Next.js con dominio de scouting separado en `lib/scouting.ts`, ingestión inicial en `/api/import-boxscores`, persistencia local de MVP y contrato relacional en `db/schema.sql`.

Produccion recomendada:

- Frontend: Next.js App Router, React, Recharts, UI por modulos.
- Backend: Next.js route handlers o NestJS/Fastify si se separa API.
- Base de datos: PostgreSQL con el esquema de `db/schema.sql`.
- Auth: proveedor compatible con RBAC, con roles `admin`, `entrenador`, `asistente`, `jugador`.
- Jobs: cola para ingestión y reprocesamiento de links Genius Sports.
- Archivos: storage para reportes y presentaciones generadas.
- Mobile futuro: API JSON estable y componentes de dominio compartidos.

## Flujo de ingestion

1. Admin pega uno o varios links FEBACHILE / Genius Sports.
2. Si el link viene desde `clnb.web.geniussports.com`, el parser lee el widget oficial `hosted.dcd.shared.geniussports.com/embednf/FDBCH/es/...` y extrae los IDs del boton `Estadisticas completas`.
3. El parser normaliza cada partido a `data/{matchId}/data.json`.
4. Se extraen equipos, marcador, jugadores, minutos, rebotes ofensivos/defensivos, asistencias, robos, perdidas, faltas, 2P, 3P, TL y titularidad cuando la fuente los entrega.
5. Se guarda `game_sources.source_url` y el payload crudo para auditoria.
6. Se actualizan `games`, `teams`, `players`, `team_game_stats` y `player_game_stats`.
7. Se calculan inferencias derivadas: rotacion, amenazas, cuartos proyectados y claves tacticas.
8. El panel admin muestra fuente original, campos confirmados, campos inferidos y ajustes manuales.

## Regla de confiabilidad

Cada dato visible debe caer en una de estas categorias:

- Dato confirmado: viene directo de la fuente o del dataset estructurado.
- Inferencia estadistica: se calcula desde muestra disponible y se muestra con confianza.
- Conclusion tactica: lectura automatica orientada al cuerpo tecnico.

Quinteto titular probable, primeros cambios, cierre de partido, amenaza rival y tendencia por cuartos se presentan como inferencias si no vienen explicitamente desde la fuente.

## Reglas de inferencia inicial

- Rotacion: ordenar por minutos, impacto reciente y aparicion disponible.
- Quinteto probable: primeros cinco de esa ponderacion.
- Primeros cambios: jugadores 6 y 7 de la rotacion.
- Nucleo 8-9: jugadores con mayor carga de minutos e impacto.
- Cierre probable: top cinco por indice de impacto reciente.
- Amenaza rival: puntos, asistencias, rebotes y minutos ponderados.
- Jugador de alto impacto sin ser goleador: rebotes y asistencias elevan el indice.
- Cuartos: si no hay parciales confirmados, se proyectan desde ataque propio, defensa rival y perfil de distribucion por cuarto.

## UI

La app queda dividida en pantallas especializadas:

- Dashboard
- Equipos
- Jugadores
- Rotacion
- Cuartos
- Comparativo
- Informes
- Presentaciones
- Notas
- Admin

El rol `jugador` ve una version recortada; `admin` ve ingestion, trazabilidad, arquitectura y permisos.

## Fases

Fase 1, implementada en este repo:

- Consola web premium para Liga DOS.
- Parser inicial de links FIBA/Genius.
- Persistencia local del MVP.
- Analitica e inferencias auditables.
- Descarga editable en Markdown para reportes y presentaciones.
- Notas privadas locales por perfil.
- Schema SQL y arquitectura productiva definidos.

Fase 2:

- Migrar persistencia local a PostgreSQL.
- Agregar auth real, sesiones, RBAC y perfiles por equipo.
- Guardar payload crudo, auditoria y correcciones manuales en tablas.
- Exportar PDF y PPTX reales con plantillas.

Fase 3:

- Jobs de ingestión, reintentos y panel de calidad.
- Soporte multi-liga y API estable para mobile.
- Reglas avanzadas por quintetos, on/off, clutch y tracking manual.

# Rili

[English](README.md) | [Simplified Chinese](README.zh-CN.md)

La vida merece ser grabada. Cuando mires atrás a días pasados, Rili tiene como objetivo mantener esos momentos como rastros útiles.

Rili es un calendario de productividad personal auto-alojado construido con Express, EJS y SQLite. Incluye:

- Gestión de tareas basada en calendario
- Tablero Kanban
- Notas diarias
- Visualización de días festivos, términos solares y festivales tradicionales
- Configuración de ciudad y visualización del clima
- API de Análisis de Notas de solo lectura

El proyecto está diseñado para el auto-alojamiento de un solo usuario. Utiliza renderizado en el servidor, mantiene las dependencias al mínimo y es sencillo de desplegar.

## Características

- `Tasks`: ver, crear, completar, editar y eliminar tareas desde un calendario mensual.
- `Subtasks`: añadir subtareas bajo tareas de nivel superior.
- `Kanban`: gestionar tareas mediante columnas de estado.
- `Notes`: guardar notas diarias en `data/notes/`.
- `Settings`: gestionar cambios de contraseña, claves de API y configuraciones de clima/festivos del administrador.
- `Notes Analysis API`: permitir que herramientas remotas como Claude Code, Cloud o CodeChurn lean las notas diarias.

## Capturas de pantalla

![Calendar view](docs/rili.png)

![Settings page](docs/setting.png)

![Note editor](docs/wriht.png)

## Stack Tecnológico

- Node.js
- Express
- EJS
- better-sqlite3
- express-session con un almacén de sesiones en SQLite

## Estructura del Proyecto

```text
src/
  app.js                 Punto de entrada de la aplicación
  config.js              Configuración de variables de entorno
  db/
    database.js          Conexión SQLite
    migrate.js           Migraciones de la base de datos
    seed.js              Carga inicial de cuenta
  middleware/
    auth.js              Autenticación de inicio de sesión
    notesApiAuth.js      Autenticación de clave de API de notas
  routes/
    auth.js
    todos.js
    notes.js
    kanban.js
    admin.js
    settings.js
    api.js
  services/
    noteService.js
    notesApiKeyService.js
    weatherService.js
    ...
  views/
    todos.ejs
    notes.ejs
    kanban.ejs
    settings.ejs

data/
  todu.db                Base de datos principal
  sessions.sqlite        Base de datos de sesiones
  notes/                 Archivos de notas
  holidays/              Caché de días festivos
  locations/             Caché de lista de ubicaciones climáticas
```

## Inicio Rápido

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
```

Edita `.env` y establece al menos:

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `SESSION_SECRET`
- Configuraciones de la API del clima, si se necesita la visualización del tiempo: `WEATHER_API_BASE_URL` y ya sea `WEATHER_API_KEY` o `WEATHER_API_TOKEN`.

### 3. Inicializar la base de datos

```bash
npm run migrate
```

### 4. Crear la cuenta inicial

```bash
npm run seed
```

La cuenta inicial se lee desde `.env`:

- Usuario: `ADMIN_USERNAME`
- Contraseña: `ADMIN_PASSWORD`

### 5. Iniciar modo de desarrollo

```bash
npm run dev
```

### 6. Iniciar modo de producción

```bash
npm start
```

URL predeterminada:

```text
http://127.0.0.1:3000
```

## Flujo de Instalación Limpia

Para una instalación nueva, utiliza esta secuencia:

```bash
cp .env.example .env
npm install
npm run migrate
npm run seed
npm start
```

Qué hace cada paso:

- `cp .env.example .env`: crea el archivo de configuración privada local.
- `npm run migrate`: crea `data/todu.db` y cualquier tabla faltante.
- `npm run seed`: crea la cuenta de administrador a partir de `ADMIN_USERNAME` y `ADMIN_PASSWORD`.
- `npm start`: inicia la aplicación.

## Migración de Datos Existentes

Mueve ambas rutas al migrar a otro servidor:

```text
data/todu.db
data/notes/
```

`data/todu.db` almacena usuarios, hashes de contraseñas, tareas y estado del clima. `data/notes/` almacena las notas diarias. Si migras solo la base de datos y omites `data/notes/`, las notas se perderán.

## Comandos Comunes

```bash
npm run dev          # Modo de desarrollo
npm start            # Inicio de producción
npm run migrate      # Ejecutar migraciones de base de datos
npm run seed         # Crear el usuario inicial
npm run holiday:sync # Sincronizar datos de festivos manualmente
npm test             # Ejecutar pruebas
```

## Almacenamiento de Datos

### Base de Datos SQLite

Ruta predeterminada de la base de datos principal:

```text
data/todu.db
```

Ruta predeterminada de la base de datos de sesiones:

```text
data/sessions.sqlite
```

### Archivos de Notas

Las notas se almacenan en el sistema de archivos en lugar de en la base de datos:

```text
data/notes/{userId}/{year}/{month}/{date}.md
```

Ejemplo:

```text
data/notes/1/2026/04/2026-04-16.md
```

Esto significa que los despliegues y respaldos deben preservar tanto la base de datos como `data/notes/`.

## Variables de Entorno

Variables de entorno comunes:

```text
HOST
PORT
DB_PATH
NOTES_DATA_DIR
ADMIN_USERNAME
ADMIN_PASSWORD
SESSION_SECRET
SESSION_DB_DIR
NODE_ENV
SESSION_COOKIE_SECURE
HOLIDAY_SOURCE_PRIMARY
HOLIDAY_SOURCE_FALLBACK
WEATHER_API_BASE_URL
WEATHER_API_KEY
WEATHER_API_TOKEN
WEATHER_LOCATION_LIST_URL
WEATHER_LOCATION
WEATHER_LOCATION_NAME
```

Notas:

- `DB_PATH`: ruta de la base de datos principal, por defecto `data/todu.db`.
- `NOTES_DATA_DIR`: directorio de archivos de notas, por defecto `data/notes`.
- `SESSION_DB_DIR`: directorio que almacena la base de datos SQLite de sesiones.
- `ADMIN_USERNAME` / `ADMIN_PASSWORD`: cuenta de administrador inicial utilizada por `npm run seed`.
- `SESSION_SECRET`: debe cambiarse en producción.
- `HOLIDAY_SOURCE_*`: URLs de la fuente de datos de días festivos.
- `WEATHER_*`: configuración de la API del clima y de la lista de ubicaciones.
- Los iconos del clima residen en `public/icons/weather/`.

Consulta `.env.example` para la plantilla completa. Para un despliegue típico de producción, mantener las rutas de datos predeterminadas es suficiente.

## Migraciones de Base de Datos

Punto de entrada de migración:

```bash
npm run migrate
```

El comportamiento actual de la migración es incremental:

- Crea tablas faltantes.
- Añade columnas faltantes.
- No elimina tablas.
- No borra datos existentes.
- No reconstruye los archivos de notas.

### Flujo de Actualización de Producción Recomendado

Las migraciones son idempotentes y retrocompatibles, pero las actualizaciones de producción deben comenzar siempre con un respaldo:

```bash
cp data/todu.db data/todu.db.$(date +%F-%H%M%S).bak
cp -r data/notes data/notes.$(date +%F-%H%M%S).bak
```

Luego ejecuta:

```bash
npm run migrate
```

## Despliegue

### PM2

Primer inicio:

```bash
pm2 start src/app.js --name rili
```

Reinicio regular:

```bash
pm2 restart rili
```

Si las variables de entorno cambiaron:

```bash
pm2 restart rili --update-env
```

### Cuándo Usar `--update-env`

Usa `--update-env` solo cuando las variables de entorno hayan cambiado, por ejemplo:

- `NODE_ENV`
- `PORT`
- `DB_PATH`
- `NOTES_DATA_DIR`
- Configuraciones de la API del clima

Si solo cambió el código, un reinicio regular es suficiente.

### Orden de Despliegue Recomendado

```bash
cd /ruta/a/rili
cp data/todu.db data/todu.db.$(date +%F-%H%M%S).bak
cp -r data/notes data/notes.$(date +%F-%H%M%S).bak
npm install
npm run migrate
pm2 restart rili
```

Si las variables de entorno también cambiaron:

```bash
pm2 restart rili --update-env
```

## API de Análisis de Notas

Rili proporciona endpoints de la API de Análisis de Notas de solo lectura para herramientas remotas como Cloud, CodeChurn y Claude Code. Estos endpoints leen el contenido guardado de `/notes` por día.

### 1. Generar una Clave de API

Después de iniciar sesión, abre:

```text
/settings
```

En la sección "Notes Analysis API", la página muestra:

- `API Base URL`
- `Paginated endpoint`
- `Single-day endpoint`
- `API Key`

Comportamiento importante:

- Las claves de API y las URLs de los endpoints se gestionan por separado.
- Después de restablecer una clave de API, la clave antigua queda invalidada inmediatamente.
- La clave completa se muestra solo cuando se genera o restablece; posteriormente, las páginas muestran solo el prefijo.

### 2. Autenticación

Todas las solicitudes de la API utilizan:

```text
Authorization: Bearer <TU_CLAVE_DE_API>
```

Ejemplo:

```bash
curl -H "Authorization: Bearer rili_npk_xxx" \
  "https://tu-dominio.com/api/v1/notes/days?page=1&pageSize=20"
```

### 3. Endpoints

#### Notas Diarias Paginadas

```http
GET /api/v1/notes/days?page=1&pageSize=20
```

Parámetros:

- `page`: número de página, por defecto `1`.
- `pageSize`: elementos por página, por defecto `20`, máximo `100`.

Ejemplo:

```bash
curl -H "Authorization: Bearer <TU_CLAVE_DE_API>" \
  "https://tu-dominio.com/api/v1/notes/days?page=1&pageSize=20"
```

Ejemplo de respuesta:

```json
{
  "items": [
    {
      "date": "2026-04-16",
      "updatedAt": "2026-04-16T05:10:23.000Z",
      "entryCount": 2,
      "combinedText": "[09:15] Primera entrada\n\n[18:45] Segunda entrada",
      "entries": [
        {
          "index": 0,
          "time": "09:15",
          "recordedAt": "2026-04-16T09:15:00",
          "content": "Primera entrada"
        },
        {
          "index": 1,
          "time": "18:45",
          "recordedAt": "2026-04-16T18:45:00",
          "content": "Segunda entrada"
        }
      ]
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 1,
    "totalPages": 1,
    "hasMore": false
  },
  "meta": {
    "generatedAt": "2026-04-16T05:11:00.000Z",
    "timezone": "Asia/Shanghai",
    "version": "v1"
  }
}
```

#### Notas de un Solo Día

```http
GET /api/v1/notes/days/:date
```

Ejemplo:

```bash
curl -H "Authorization: Bearer <TU_CLAVE_DE_API>" \
  "https://tu-dominio.com/api/v1/notes/days/2026-04-16"
```

Ejemplo de respuesta:

```json
{
  "item": {
    "date": "2026-04-16",
    "updatedAt": "2026-04-16T05:10:23.000Z",
    "entryCount": 2,
    "combinedText": "[09:15] Primera entrada\n\n[18:45] Segunda entrada",
    "entries": [
      {
        "index": 0,
        "time": "09:15",
        "recordedAt": "2026-04-16T09:15:00",
        "content": "Primera entrada"
      },
      {
        "index": 1,
        "time": "18:45",
        "recordedAt": "2026-04-16T18:45:00",
        "content": "Segunda entrada"
      }
    ]
  },
  "meta": {
    "generatedAt": "2026-04-16T05:11:00.000Z",
    "timezone": "Asia/Shanghai",
    "version": "v1"
  }
}
```

### 4. Campos de Respuesta

Elemento de nota diaria:

- `date`: fecha en formato `YYYY-MM-DD`.
- `updatedAt`: hora de última modificación del archivo de nota de ese día.
- `entryCount`: número de entradas del día.
- `combinedText`: todas las entradas de texto del día combinadas en una cadena, útil para resúmenes o análisis.
- `entries`: entradas de notas individuales del día.

Entrada individual:

- `index`: índice de la entrada del día, comenzando desde `0`.
- `time`: hora registrada en formato `HH:mm`.
- `recordedAt`: marca de tiempo construida a partir de `date + time`; `null` si falta la hora.
- `content`: texto de la entrada.

Paginación:

- `page`
- `pageSize`
- `totalItems`
- `totalPages`
- `hasMore`

Metadatos:

- `generatedAt`
- `timezone`
- `version`

### 5. Prompt Sugerido para Claude Code / Cloud

Si deseas que Claude Code u otra herramienta de análisis utilice estos endpoints, proporciona:

- `Base URL`
- `API Key`
- Endpoint paginado
- Endpoint de un solo día
- Formato del encabezado de autenticación
- Descripciones de los campos de respuesta

Puedes darle este prompt:

```text
Puedes leer los datos de mi diario a través de esta API:

Base URL: https://tu-dominio.com/api/v1
API Key: <TU_CLAVE_DE_API>
Endpoint paginado: GET /notes/days?page=1&pageSize=20
Endpoint de un solo día: GET /notes/days/:date

Encabezado de solicitud:
Authorization: Bearer <TU_CLAVE_DE_API>

Por favor, obtén primero los últimos 7 días y luego resúmelos.
```

### 6. Limitaciones Actuales

- La API es de solo lectura y no admite escrituras, ediciones o eliminaciones externas.
- La API no devuelve actualmente campos climáticos.
- Los datos brutos de las notas se siguen almacenando en el directorio `data/notes/`, no en la base de datos.

## Pruebas

Ejecuta:

```bash
npm test
```

## Notas Finales

- Cambia siempre `SESSION_SECRET` y `ADMIN_PASSWORD` en producción, y usa tu propia clave o token de la API del clima.
- Al migrar servidores, mueve tanto `data/todu.db` como `data/notes/`.
- Una clave completa de la API de Análisis de Notas se muestra solo cuando se genera o restablece, así que guárdala inmediatamente.

# Thesis Compass

Aplicación de gestión de evaluación de tesis universitarias. Los roles
incluyen estudiante, evaluador, administrador y superadministrador. El
backend está construido con Node/Express y SQLite; el frontend con React y
Vite.

## ¿Qué hace?

- Permite registrar tesis, asignar evaluadores, cargar documentos y
  rúbricas.
- Los estudiantes visualizan su tesis y el progreso en una línea de tiempo.
- Los evaluadores califican mediante rúbricas y anexan archivos.
- Los administradores gestionan usuarios, programas, evaluaciones y
  estadísticas.
- La app es totalmente SPA y se comunica con la API mediante JWT.

## Estructura de carpetas

```
/ (root)
├── docker-compose.yml      # contenedores de desarrollo
├── Dockerfile              # imagen del frontend
├── server/                 # código del backend (Express)
│   ├── index.js
│   ├── db.js
│   ├── seed.js
│   ├── entrypoint.sh
│   ├── Dockerfile          # imagen del backend
│   └── ...
├── src/                    # código del cliente React/Vite
└── README.md               # este archivo
```

## Variables de entorno (`.env`)

```env
# BACKEND
JWT_SECRET=una_clave_secreta
ADMIN_EMAIL=admin@admin.com      # usuario inicial de superadmin
ADMIN_PASSWORD=admin
# (opcional) ubicación de la base SQLite y uploads
DATA_DIR=/app/data
UPLOAD_DIR=/app/uploads

# FRONTEND (para el build)
VITE_API_BASE=https://api.tu-dominio.com   # URL pública de la API
```

- `JWT_SECRET`: usado por el backend para firmar tokens.
- `ADMIN_EMAIL`/`ADMIN_PASSWORD`: se siembran en la DB en el arranque si no
  existe ningún usuario.
- `VITE_API_BASE`: se lee durante `npm run build`; puede apuntar al mismo
dominio del frontend (entonces las rutas son relativas) o a un subdominio.

## Desarrollo local con Docker

1. Clona el repositorio y sitúate en la carpeta raíz.
2. Crea un `.env` con las variables mínimas (ejemplos arriba).
3. Ejecuta:
   ```bash
   docker compose up -d --build
   ```
   - Backend en `http://localhost:4000`
   - Frontend en `http://localhost:5173`
4. El backend inicializa la DB y siembra el superadmin.
5. Si cambias dependencias del servidor usa `docker compose build backend` y
   luego reinicia.
6. Para reiniciar la base de datos y borrar cargas:
   ```bash
   docker compose down
   rm -rf server/data/* server/uploads/*
   docker compose up -d --build
   ```

## Despliegue en servidor

1. **Construye el frontend** con la variable apropiada:
   ```bash
   export VITE_API_BASE=https://api.tudominio.com
   npm run build
   ```
2. Sirve la carpeta `dist` con nginx, Caddy, Apache o desde el propio
   backend usando `express.static` y una ruta "catch‑all" para SPA.
3. Asegúrate de que el backend está accesible desde el dominio (`4000` o
   cualquier puerto) y de que la variable `JWT_SECRET` está definida.
4. Mounta volúmenes para `data` y `uploads` si usas Docker, o gestiona el
   almacenamiento en disco.
5. No necesitas el proxy de Vite en producción: todas las llamadas se
   harán a la URL establecida en `VITE_API_BASE` (o de forma relativa si
   frontend y backend comparten origen).
6. Configura las reglas de CORS en el backend si lo deseas, actualmente
   permite cualquier origen.

## Consideraciones

- Todos los componentes usan `getApiBase()` para determinar la URL de la
  API; así se evita hard‑codear hosts y es fácil cambiar el comportamiento
  según el entorno.
- Durante el desarrollo el proxy de Vite redirige `/auth`, `/theses`,
  `/admin/*`, `/profiles`, `/programs`, `/users`, `/super` al backend.
- En producción el servidor web/proxy debe reenviar esas rutas a la API
  o el frontend debe conocer la URL completa.
- El esquema de la base de datos se migra automáticamente al arrancar el
  servidor. Si agregas columnas nuevos al `db.js` reinicia el backend.

## Tecnologías principales

- **Frontend**: React, TypeScript, Vite, Tailwind CSS, shadcn‑ui.
- **Backend**: Node.js, Express, SQLite, bcryptjs, JWT.
- **DevOps**: Docker Compose (frontend + backend).

Con estos pasos podrás clonar el repo, arrancarlo localmente y después
subirlo a cualquier servidor con dominio propio usando contenedores o
servicios tradicionales.

¡Listo para el despliegue! 🎯

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## Docker & backend development

The backend runs inside a Docker container defined in `docker-compose.yml`. By default the service mounts `./server` so code changes are applied immediately (no rebuild needed) and the SQLite database lives in a named volume `db_data`.

If you ever modify the database schema (e.g. add a new column) the migration logic in `server/db.js` will attempt to apply `ALTER TABLE` statements on startup. For those changes to take effect you must restart the backend container; rebuilding the image is **not** required in development when the source is mounted.

To rebuild the image (e.g. after changing dependencies) run:

```sh
docker compose build backend
```

and then restart:

```sh
docker compose up -d backend
```

On a fresh setup the `programs` table already includes the `admin_user_id` column; a new `program_admins` join table is also created to support multiple admins per program. Upgrades from older versions will automatically add both the column and populate the join table during startup.  

Additionally, there is now a `keywords` field on theses (used by the student registration form) – the migration logic will also add that column when the backend starts.

When evaluators are assigned the timeline entry now includes their names (unless the assignment was marked as a blind/"par ciego" review), and the student page also lists assigned evaluators above the timeline. The API also returns an `is_blind` flag on evaluator records.

Once both evaluators approve a thesis the status changes to **sustentacion**; admins can then schedule the defence by picking a date/time, location and any additional notes (using the "Programar Sustentación" form on the thesis detail page). That information is stored on the thesis and a timeline event is created – students and evaluators will see the date, hora, lugar y las notas en sus timelines tan pronto como el admin lo guarde.

----

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)

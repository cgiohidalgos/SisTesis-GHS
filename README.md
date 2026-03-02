# Welcome to your Lovable project

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

# NUSHub

NUSHub is a digital community platform built for the National University of Singapore (NUS) community. It provides a single, organized space where students can discuss campus life, share useful information, connect with one another, and form study groups.

The project was originally started as a two-person project. It is now maintained and developed primarily as a personal project by [Dao Anh Khoa](https://github.com/itzkhoadao).

## What You Can Do

- Create an account and sign in with email or Google
- Create, browse, search, and filter community posts
- Comment on posts and vote on useful content
- Explore user profiles and recent activity
- Create and join study groups
- Chat with other community members in real time
- Upload images and attachments

## Planned AI Assistant

NUSHub is preparing a grounded AI assistant for basic NUS information. The
planned design uses the Gemini API for language generation, NUSMods for
structured course data, and an approved set of official NUS sources for
retrieval and citations.

The assistant is not implemented or available to users yet. It will remain
disabled until authentication, privacy, source-governance, evaluation, cost,
and safety release gates are complete.

## Tech Stack

- **Frontend:** React, TypeScript, Vite, Tailwind CSS, React Query
- **Backend:** Node.js, Express, TypeScript, Socket.IO
- **Database:** PostgreSQL
- **Authentication:** JWT, bcrypt, and Google Sign-In
- **File storage:** Cloudflare R2-compatible object storage

## How to Use NUSHub

After starting the application, open `http://localhost:5173` in your browser.

1. Register for an account or sign in.
2. Browse the home feed or use search and filters to find discussions.
3. Open a post to read its comments, vote, or add a response.
4. Select **Create Post** to start a new discussion.
5. Visit **Groups** to browse, create, or join a study group.
6. Visit **Chat** to message other NUSHub users.
7. Use your profile page to manage your information and review your activity.

## Run Locally

### Prerequisites

Install the following before you begin:

- [Node.js](https://nodejs.org/) and npm
- [PostgreSQL](https://www.postgresql.org/)
- Git

Google OAuth credentials and Cloudflare R2-compatible storage credentials are optional and are only needed for Google Sign-In and file uploads respectively.

### 1. Clone the Repository

```bash
git clone https://github.com/itzkhoadao/nusHub.git
cd nusHub
```

### 2. Configure the Backend

Install the server dependencies:

```bash
cd server
npm install
```

Copy the provided environment template:

```bash
cp .env.example .env
```

The required backend variables are:

```env
PORT=5000
DATABASE_URL=your_postgresql_connection_string
JWT_SECRET=your_secure_jwt_secret
CLIENT_URL=http://localhost:5173
```

Optional: add Google Sign-In support:

```env
GOOGLE_CLIENT_ID=your_google_oauth_client_id
```

Optional: add Cloudflare R2 storage for file uploads:

```env
R2_ACCOUNT_ID=your_r2_account_id
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
R2_BUCKET_NAME=your_r2_bucket_name
R2_PUBLIC_BASE_URL=your_r2_public_base_url
```

If these optional variables are not configured, Google Sign-In and attachment uploads may not work, but the core app can still run.

Start the backend development server:

```bash
npm run dev
```

The API will run at `http://localhost:5000` by default.

### 3. Configure the Frontend

Open a second terminal, then install the client dependencies:

```bash
cd client
npm install
```

Copy the provided environment template:

```bash
cp .env.example .env
```

The required frontend variable is:

```env
VITE_API_URL=http://localhost:5000
```

Optional: add Google Sign-In support:

```env
VITE_GOOGLE_CLIENT_ID=your_google_oauth_client_id
```

Update the copied `.env` files with your own local configuration before starting the app.

Start the frontend development server:

```bash
npm run dev
```

Open `http://localhost:5173` in your browser.

## Available Commands

Run these commands from the relevant `client` or `server` directory.

| Directory | Command | Purpose |
| --- | --- | --- |
| `client` | `npm run dev` | Start the frontend development server |
| `client` | `npm run build` | Create a production frontend build |
| `client` | `npm run lint` | Check frontend code quality |
| `client` | `npm run preview` | Preview the production frontend build |
| `server` | `npm run dev` | Start the backend with automatic reloads |
| `server` | `npm run build` | Compile the backend TypeScript |
| `server` | `npm start` | Run the compiled backend |

## Project Structure

```text
nusHub/
├── client/       # React frontend
├── server/       # Express API, real-time chat, and database access
└── README.md
```

## Project Status

NUSHub is under active development. Features and setup requirements may change as the platform evolves.

## License

No formal license has been added yet.

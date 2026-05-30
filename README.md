# Finance Tracker

Personal finance tracker with income & expenses, charts, and Supabase authentication.

## Setup

### 1. Install dependencies

```bash
cd expense_tracker
npm install
```

### 2. Configure Supabase (required for login)

1. Create a free project at [supabase.com](https://supabase.com)
2. Open **Project Settings → API** and copy:
   - **Project URL** → `SUPABASE_URL`
   - **anon public** key → `SUPABASE_ANON_KEY`
3. In **Authentication → Providers → Email**, enable Email provider
4. For local development, you can disable **Confirm email** under Email settings (optional)
5. Create `.env` from the example:

```bash
copy .env.example .env
```

Edit `.env`:

```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-anon-public-key
```

### 3. Optional: MySQL

If MySQL is not available, the app uses SQLite automatically (`data/expenses.sqlite`).

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=expense_tracker_db
DB_PORT=3306
```

### 4. Start the server

```bash
npm start
```

### 5. Open the app

- **Register:** http://localhost:3000/register.html
- **Sign in:** http://localhost:3000/login.html
- **Dashboard:** http://localhost:3000 (requires sign in)

## Features

- Email/password register & login (Supabase Auth)
- Per-user expense data (each account sees only its own transactions)
- Income & expense tracking with charts (INR)
- Monthly & daily analytics with month picker
- Responsive layout

## Scripts

- `npm start` — run server
- `npm run dev` — run with nodemon (auto-restart)

## Notes

- Each user's transactions are stored with their Supabase `user_id`
- Never commit `.env` or share your Supabase service role key
- The **anon** key is safe to use in the browser; it is exposed via `/api/config`

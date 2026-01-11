# Nova Fall - macOS Development Setup

This guide walks through setting up the Nova Fall development environment on macOS.

---

## Prerequisites

### 1. Install Homebrew

If you don't have Homebrew installed:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Follow the post-install instructions to add Homebrew to your PATH.

### 2. Install Node.js 20 LTS

```bash
brew install node@20
```

If you have multiple Node versions, you may want to use a version manager:

```bash
# Option A: Use Homebrew's node@20 directly
echo 'export PATH="/opt/homebrew/opt/node@20/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc

# Option B: Use nvm (Node Version Manager)
brew install nvm
mkdir ~/.nvm
echo 'export NVM_DIR="$HOME/.nvm"' >> ~/.zshrc
echo '[ -s "/opt/homebrew/opt/nvm/nvm.sh" ] && \. "/opt/homebrew/opt/nvm/nvm.sh"' >> ~/.zshrc
source ~/.zshrc
nvm install 20
nvm use 20
```

Verify installation:

```bash
node --version  # Should show v20.x.x
```

### 3. Install pnpm

```bash
npm install -g pnpm
```

Verify:

```bash
pnpm --version  # Should show 9.x.x
```

### 4. Install PostgreSQL

```bash
brew install postgresql@16
brew services start postgresql@16
```

Add to PATH:

```bash
echo 'export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

Create a database for the project:

```bash
createdb novafall
```

### 5. Install Redis

```bash
brew install redis
brew services start redis
```

Verify Redis is running:

```bash
redis-cli ping  # Should return "PONG"
```

---

## Project Setup

### 1. Clone the Repository

```bash
cd ~/Projects  # or wherever you keep your code
git clone <your-repo-url> nova-fall
cd nova-fall
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Environment Configuration

Copy the example environment files and configure them:

```bash
# API environment
cp apps/api/.env.example apps/api/.env

# Web environment (if exists)
cp apps/web/.env.example apps/web/.env
```

Edit `apps/api/.env` with your local settings:

```env
# Database - Local PostgreSQL
DATABASE_URL="postgresql://localhost:5432/novafall"

# Redis - Local Redis
REDIS_URL="redis://localhost:6379"

# Session secret (generate a random string)
SESSION_SECRET="your-random-secret-here"

# OAuth credentials (copy from your Windows setup or Railway dashboard)
DISCORD_CLIENT_ID="your-discord-client-id"
DISCORD_CLIENT_SECRET="your-discord-client-secret"
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

# Frontend URL
FRONTEND_URL="http://localhost:5173"

# API URL
API_URL="http://localhost:3000"
```

### 4. Database Setup

```bash
# Generate Prisma client
pnpm db:generate

# Run migrations
pnpm db:migrate

# Seed the database
pnpm db:seed
```

### 5. Verify Setup

```bash
# Type checking
pnpm typecheck

# Linting
pnpm lint

# Build all packages
pnpm build
```

---

## Running the Development Server

### Start All Services

```bash
pnpm dev
```

This typically starts:
- **API** at http://localhost:3000
- **Web** at http://localhost:5173
- **WebSocket server** (if separate)
- **Worker** (background jobs)

### Start Individual Services

```bash
# Just the API
pnpm --filter api dev

# Just the web frontend
pnpm --filter web dev

# Just the worker
pnpm --filter worker dev
```

---

## Using Railway Database (Alternative)

If you prefer to use the Railway-hosted PostgreSQL instead of local:

1. Go to your Railway dashboard
2. Find your PostgreSQL service
3. Copy the connection string from the "Connect" tab
4. Update `DATABASE_URL` in your `.env` file

**Note:** This requires internet access and may have higher latency than local development.

---

## Claude Code Setup

### 1. Install Claude Code

```bash
npm install -g @anthropic-ai/claude-code
```

### 2. Replace CLAUDE.md

Copy the macOS version of Claude instructions to the project root:

```bash
cp docs/mac-claude.md CLAUDE.md
```

### 3. Start Claude Code

```bash
claude
```

Claude Code will read `CLAUDE.md` and understand the project context.

---

## Common Commands Reference

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all development servers |
| `pnpm build` | Build all packages |
| `pnpm typecheck` | Run TypeScript type checking |
| `pnpm lint` | Run ESLint |
| `pnpm lint:fix` | Run ESLint with auto-fix |
| `pnpm test` | Run tests |
| `pnpm db:generate` | Regenerate Prisma client |
| `pnpm db:migrate` | Apply pending migrations |
| `pnpm db:seed` | Seed the database |
| `pnpm db:reseed-map` | Reseed map nodes only (preserves items/blueprints) |
| `pnpm db:studio` | Open Prisma Studio (database GUI) |

---

## Troubleshooting

### PostgreSQL Connection Issues

```bash
# Check if PostgreSQL is running
brew services list

# Restart PostgreSQL
brew services restart postgresql@16

# Check if database exists
psql -l | grep novafall
```

### Redis Connection Issues

```bash
# Check if Redis is running
brew services list

# Restart Redis
brew services restart redis

# Test connection
redis-cli ping
```

### Port Already in Use

```bash
# Find what's using a port (e.g., 3000)
lsof -i :3000

# Kill the process
kill -9 <PID>
```

### Prisma Issues

```bash
# Regenerate Prisma client after schema changes
pnpm db:generate

# Reset database (WARNING: destroys all data)
pnpm db:reset
```

### Node Module Issues

```bash
# Clear and reinstall dependencies
rm -rf node_modules
rm -rf apps/*/node_modules
rm -rf packages/*/node_modules
pnpm install
```

---

## Syncing with Windows Setup

When you return to your Windows machine:

1. **Pull latest changes** from git
2. **Reinstall dependencies** in PowerShell (not WSL):
   ```powershell
   Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
   pnpm install
   pnpm db:generate
   ```
3. **Restore the Windows CLAUDE.md** if you modified it:
   ```powershell
   git checkout CLAUDE.md
   ```

The database on Railway is shared, so any data changes will be reflected on both machines if you're using Railway's hosted database.

---

## Quick Start Checklist

- [ ] Homebrew installed
- [ ] Node.js 20 LTS installed
- [ ] pnpm installed
- [ ] PostgreSQL installed and running
- [ ] Redis installed and running
- [ ] Repository cloned
- [ ] Dependencies installed (`pnpm install`)
- [ ] Environment files configured
- [ ] Database migrated and seeded
- [ ] `pnpm dev` runs successfully
- [ ] Claude Code installed
- [ ] `docs/mac-claude.md` copied to `CLAUDE.md`

---

_Last Updated: 2026-01-11_

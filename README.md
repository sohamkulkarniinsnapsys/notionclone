# Notion Clone - Collaborative Document Editor

A real-time collaborative document editor built with Next.js, Yjs, Tiptap, and PostgreSQL. Features Google OAuth authentication, real-time collaborative editing with presence indicators, and persistent document storage.

> **⚠️ CRITICAL**: This application requires **TWO separate servers** to run:
> 1. WebSocket server (`npm run yws`) - Port 1234
> 2. Next.js server (`npm run dev`) - Port 3000
>
> Both must be running simultaneously for collaboration to work!

## Features

- 🔐 **Google OAuth Authentication** - Secure sign-in with NextAuth
- ✍️ **Real-time Collaborative Editing** - Multiple users can edit simultaneously using Yjs CRDT
- 👥 **Presence Indicators** - See who's currently editing with cursor positions
- 💾 **Automatic Persistence** - Documents auto-save to PostgreSQL
- 📝 **Rich Text Editor** - Powered by Tiptap with markdown support
- 🏢 **Workspace Management** - Organize documents in workspaces with role-based access
- 🔒 **Secure WebSocket** - JWT token-based authentication for WebSocket connections

## Tech Stack

- **Frontend**: Next.js 15 (App Router), React 19, TypeScript
- **Editor**: Tiptap, Yjs, y-websocket, y-prosemirror
- **Authentication**: NextAuth.js with Google OAuth
- **Database**: PostgreSQL with Prisma ORM
- **Styling**: Tailwind CSS
- **Real-time**: WebSocket server with y-websocket

## Prerequisites

- Node.js 18+
- PostgreSQL 12+
- Google OAuth credentials ([Get them here](https://console.cloud.google.com))

## Getting Started

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd notionclonenextjs
npm install
```

### 2. Set Up Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Required variables:
```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/notionclone
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secure-random-secret-here
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
NEXT_PUBLIC_Y_WS_URL=ws://localhost:1234
```

### 3. Set Up Database

```bash
# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev --name init

# Seed database (optional)
npm run seed
```

### 4. Run Development Servers

⚠️ **IMPORTANT**: You need to run TWO servers simultaneously for the collaborative editor to work!

**Terminal 1 - WebSocket Server (Start this FIRST):**
```bash
npm run yws
```

You should see:
```
✅ y-websocket server running on ws://localhost:1234
✅ Health check available at http://localhost:1234/health
✅ Token validation: enabled
```

**Terminal 2 - Next.js Frontend:**
```bash
npm run dev
```

You should see:
```
▲ Next.js 16.0.1
- Local:        http://localhost:3000
✓ Ready in 2.5s
```

### 5. Open Application

Open [http://localhost:3000](http://localhost:3000) in your browser.

**Verify WebSocket Server**: 
```bash
curl http://localhost:1234/health
```

Should return: `{"status":"ok","uptime":...,"connections":0}`

## Project Structure

```
├── app/                          # Next.js app directory
│   ├── api/                      # API routes
│   │   ├── auth/                 # NextAuth endpoints
│   │   ├── documents/            # Document CRUD
│   │   ├── workspaces/           # Workspace management
│   │   └── yjs/                  # WebSocket token generation
│   ├── workspace/                # Workspace pages
│   └── auth/                     # Auth pages
├── apps/
│   └── ws-server/                # WebSocket server for Yjs
│       └── src/
│           ├── ws/               # WebSocket logic
│           └── index.ts          # Server entry point
├── components/                   # React components
├── lib/                          # Shared utilities
│   ├── auth.ts                   # Auth helpers
│   └── prisma.ts                 # Prisma client
├── prisma/                       # Database schema and migrations
│   ├── schema.prisma             # Database schema
│   └── seed.ts                   # Seed script
└── docs/                         # Documentation
    └── deployment.md             # Deployment guide
```

## Available Scripts

- `npm run dev` - Start Next.js development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run typecheck` - Run TypeScript type checking
- `npm run seed` - Seed database with sample data
- `npm run yws` - Start WebSocket server

## Key Concepts

### Authentication Flow

1. User signs in with Google OAuth
2. NextAuth creates session and stores in database
3. Session includes user ID for authorization
4. Protected routes check session server-side

### Collaborative Editing Flow

1. Client loads document and fetches snapshot from API
2. Client requests WebSocket token from `/api/yjs/token`
3. Client connects to WebSocket server with token
4. Server verifies JWT token and allows connection
5. Yjs syncs document state between all connected clients
6. Changes are automatically persisted to database

### Document Persistence
- **Client-side**: Debounced auto-save every 2 seconds
- **Server-side**: WebSocket server persists every 60 seconds
- **Snapshots**: Compressed Yjs state stored in PostgreSQL
- **Cleanup**: Old snapshots automatically cleaned up (keeps last 10)

### Dashboard
- After sign-in, users are redirected to `/dashboard` where they can:
  - View their workspaces
  - See recent documents
  - Create a new document within a selected workspace

### Derived JSON (read model)
- `Document.contentJson` provides a read/export/search-friendly representation of editor content (non-collab mode).
- Endpoints:
  - `GET /api/docs/[id]` returns `{ id, title, contentJson }`
  - `PATCH /api/docs/[id]` updates `contentJson` (ACL enforced)

## Development Tips

### Database Management

```bash
# View database in Prisma Studio
npx prisma studio

# Create new migration
npx prisma migrate dev --name your_migration_name

# Reset database (WARNING: deletes all data)
npx prisma migrate reset
```

### Debugging

- Check browser console for client-side errors
- Check terminal for server-side errors
- Use Prisma Studio to inspect database
- Monitor WebSocket connections in browser DevTools

### Adding New Features

1. Update Prisma schema if needed
2. Run `npx prisma migrate dev`
3. Update API routes
4. Update UI components
5. Test locally before deploying

## Deployment

See [docs/deployment.md](./docs/deployment.md) for detailed deployment instructions.

Quick deploy options:
- **Frontend**: Vercel, Netlify, Railway
- **WebSocket Server**: Fly.io, Railway, Render
- **Database**: Vercel Postgres, Supabase, Neon

## Troubleshooting

### WebSocket Connection Issues

- Ensure WebSocket server is running on port 1234
- **Make sure WebSocket server is running**: `npm run yws` in a separate terminal
- Check `NEXT_PUBLIC_Y_WS_URL` environment variable (should be `ws://localhost:1234`)
- Verify firewall allows WebSocket connections on port 1234
- Test WS server health: `curl http://localhost:1234/health`

### Authentication Issues

- Verify Google OAuth credentials are correct
- Check `NEXTAUTH_SECRET` is set and consistent
- Ensure `NEXTAUTH_URL` matches your domain

### Database Issues

- Verify `DATABASE_URL` is correct
- Run `npx prisma generate` after schema changes
- Check PostgreSQL is running and accessible

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run type checking: `npm run typecheck`
5. Submit a pull request

## License

MIT

## Support

For issues and questions:
- Open a GitHub issue
- Check existing documentation
- Review error logs

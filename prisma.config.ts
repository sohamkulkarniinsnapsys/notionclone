// prisma.config.ts
import dotenv from 'dotenv'
import "dotenv/config";

// explicitly load .env from project root
dotenv.config({ path: '.env' })

// export a plain object for Prisma CLI to read at runtime
const config = {
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  engine: 'classic',
  datasource: {
    url: process.env.DATABASE_URL,
  },
}

export default config as any

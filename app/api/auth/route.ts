// NextAuth API route - this is a placeholder
// The actual NextAuth routes are at /api/auth/[...nextauth]
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ 
    message: 'NextAuth is configured at /api/auth/[...nextauth]' 
  });
}

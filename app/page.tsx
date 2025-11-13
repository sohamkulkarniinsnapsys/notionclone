// apps/frontend/app/page.tsx
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import prisma from '@/lib/prisma';

export default async function Home() {
  const session = await getSession();

  if (!session?.user) {
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center', 
        minHeight: '100vh',
        gap: 20 
      }}>
        <h1>Welcome to Notion Clone</h1>
        <p>A collaborative document editor built with Next.js, Yjs, and Tiptap</p>
        <Link href="/auth/signin">
          <button style={{
            padding: '12px 24px',
            fontSize: '16px',
            backgroundColor: '#4285f4',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}>
            Sign In
          </button>
        </Link>
      </div>
    );
  }

  // Signed-in users land on the dashboard
  redirect('/dashboard');
}

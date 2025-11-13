// Workspace page - redirects to documents list
import { redirect } from 'next/navigation';

type Props = {
  params: Promise<{ workspaceId: string }>;
};

export default async function WorkspacePage({ params }: Props) {
  const { workspaceId } = await params;
  
  // Redirect to documents list
  redirect(`/workspace/${workspaceId}/documents`);
}

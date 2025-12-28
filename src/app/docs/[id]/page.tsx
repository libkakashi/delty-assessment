'use client';

import {useState, useEffect} from 'react';
import {useRouter, useParams} from 'next/navigation';
import {useUser} from '@clerk/nextjs';
import {trpc} from '~/components/providers/TRPCProvider';
import {Button} from '~/components/ui/button';
import {Input} from '~/components/ui/input';
import {Loader2, Save, ArrowLeft, Trash2} from 'lucide-react';
import {Card, CardContent} from '~/components/ui/card';
import ChatSidebar from '~/components/ChatSidebar';

export default function DocumentEditorPage() {
  const router = useRouter();
  const params = useParams();
  const {isLoaded, isSignedIn} = useUser();
  const documentId = Number(params.id);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [hasChanges, setHasChanges] = useState(false);

  const {
    data: document,
    isLoading,
    error,
  } = trpc.documents.getById.useQuery(
    {id: documentId},
    {
      enabled: isSignedIn && !isNaN(documentId),
    },
  );

  const updateMutation = trpc.documents.update.useMutation({
    onSuccess: () => {
      setHasChanges(false);
    },
  });

  const deleteMutation = trpc.documents.delete.useMutation({
    onSuccess: () => {
      router.push('/docs');
    },
  });

  useEffect(() => {
    if (document) {
      setTitle(document.title);
      setContent(document.content || '');
    }
  }, [document]);

  const handleSave = () => {
    if (title.trim()) {
      updateMutation.mutate({
        id: documentId,
        title: title.trim(),
        content,
      });
    }
  };

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this document?')) {
      deleteMutation.mutate({id: documentId});
    }
  };

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    setHasChanges(true);
  };

  const handleContentChange = (newContent: string) => {
    setContent(newContent);
    setHasChanges(true);
  };

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isSignedIn) {
    router.push('/signin');
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Card className="border-destructive">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <h3 className="text-xl font-semibold mb-2 text-destructive">
              Error Loading Document
            </h3>
            <p className="text-muted-foreground text-center mb-4">
              {error.message}
            </p>
            <Button onClick={() => router.push('/docs')} variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Documents
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-[90vh] overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <div className="flex items-center justify-between mb-6">
            <Button
              variant="ghost"
              onClick={() => router.push('/docs')}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Documents
            </Button>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className="gap-2"
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Delete
              </Button>
              <Button
                onClick={handleSave}
                disabled={
                  !hasChanges || !title.trim() || updateMutation.isPending
                }
                className="gap-2"
              >
                {updateMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {hasChanges ? 'Save Changes' : 'Saved'}
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <Input
                placeholder="Document title..."
                value={title}
                onChange={e => handleTitleChange(e.target.value)}
                className="text-2xl font-bold border-none px-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                disabled={updateMutation.isPending}
              />
            </div>

            <div>
              <textarea
                placeholder="Start writing..."
                value={content}
                onChange={e => handleContentChange(e.target.value)}
                className="w-full min-h-[calc(100vh-300px)] p-4 rounded-md border border-input bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                disabled={updateMutation.isPending}
              />
            </div>
          </div>

          {document && (
            <div className="mt-4 text-sm text-muted-foreground">
              Last updated: {new Date(document.updated_at).toLocaleString()}
            </div>
          )}
        </div>
      </div>
      <div className="w-96 flex-shrink-0">
        <ChatSidebar />
      </div>
    </div>
  );
}

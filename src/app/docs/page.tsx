'use client';

import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {useUser} from '@clerk/nextjs';
import {Loader2, Plus, Edit, Trash2} from 'lucide-react';
import {trpc} from '~/components/providers/TRPCProvider';
import {Button} from '~/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '~/components/ui/card';
import {Input} from '~/components/ui/input';
import ChatSidebar from '~/components/ChatSidebar';

export default function DocumentsPage() {
  const router = useRouter();
  const {isLoaded, isSignedIn} = useUser();
  const [isCreating, setIsCreating] = useState(false);
  const [newDocTitle, setNewDocTitle] = useState('');

  const {
    data: documents,
    isLoading,
    refetch,
  } = trpc.documents.getAll.useQuery(undefined, {
    enabled: isSignedIn,
  });

  const createMutation = trpc.documents.create.useMutation({
    onSuccess: data => {
      setIsCreating(false);
      setNewDocTitle('');
      refetch();
      router.push(`/docs/${data.id}`);
    },
  });

  const deleteMutation = trpc.documents.delete.useMutation({
    onSuccess: () => {
      refetch();
    },
  });

  const handleCreateDocument = () => {
    if (newDocTitle.trim()) {
      createMutation.mutate({
        title: newDocTitle.trim(),
        content: '',
      });
    }
  };

  const handleEditDocument = (id: number) => {
    router.push(`/docs/${id}`);
  };

  const handleDeleteDocument = (id: number) => {
    if (confirm('Are you sure you want to delete this document?')) {
      deleteMutation.mutate({id});
    }
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

  return (
    <div className="flex h-[90vh] overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                My Documents
              </h1>
              <p className="text-muted-foreground mt-1">
                Manage and organize your documents
              </p>
            </div>
            <Button
              onClick={() => setIsCreating(true)}
              size="lg"
              className="gap-2"
            >
              <Plus className="h-5 w-5" />
              New Document
            </Button>
          </div>

          {isCreating && (
            <Card className="mb-8 border-2 border-primary">
              <CardHeader>
                <CardTitle>Create New Document</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter document title..."
                    value={newDocTitle}
                    onChange={e => setNewDocTitle(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        handleCreateDocument();
                      } else if (e.key === 'Escape') {
                        setIsCreating(false);
                        setNewDocTitle('');
                      }
                    }}
                    autoFocus
                    disabled={createMutation.isPending}
                  />
                  <Button
                    onClick={handleCreateDocument}
                    disabled={!newDocTitle.trim() || createMutation.isPending}
                  >
                    {createMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Create'
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsCreating(false);
                      setNewDocTitle('');
                    }}
                    disabled={createMutation.isPending}
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : documents && documents.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {documents.map(doc => (
                <Card
                  key={doc.id}
                  className="hover:shadow-lg transition-shadow cursor-pointer group"
                >
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg line-clamp-2 group-hover:text-primary transition-colors">
                      {doc.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pb-3">
                    <div className="text-sm text-muted-foreground line-clamp-3">
                      {doc.content || 'Empty document'}
                    </div>
                    <div className="text-xs text-muted-foreground mt-3">
                      Updated {new Date(doc.updated_at).toLocaleDateString()}
                    </div>
                  </CardContent>
                  <CardFooter className="flex gap-2 pt-3 border-t">
                    <Button
                      variant="default"
                      size="sm"
                      className="flex-1 gap-2"
                      onClick={() => handleEditDocument(doc.id)}
                    >
                      <Edit className="h-4 w-4" />
                      Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={e => {
                        e.stopPropagation();
                        handleDeleteDocument(doc.id);
                      }}
                      disabled={deleteMutation.isPending}
                    >
                      {deleteMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <div className="rounded-full bg-muted p-4 mb-4">
                  <Plus className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-xl font-semibold mb-2">No documents yet</h3>
                <p className="text-muted-foreground text-center mb-4">
                  Get started by creating your first document
                </p>
                <Button onClick={() => setIsCreating(true)} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Create Document
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      <div className="w-96 flex-shrink-0">
        <ChatSidebar />
      </div>
    </div>
  );
}

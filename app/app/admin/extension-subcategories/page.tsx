
'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Plus,
  Edit,
  Trash2,
  Save,
  X,
  FileBarChart,
  AlertTriangle
} from 'lucide-react';
import { toast } from 'react-hot-toast';

interface ExtensionSubcategory {
  id: string;
  code: string;
  name: string;
  description: string;
  displayOrder: number;
  isActive: boolean;
}

export default function ExtensionSubcategoriesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [subcategories, setSubcategories] = useState<ExtensionSubcategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedSubcategory, setSelectedSubcategory] = useState<ExtensionSubcategory | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    description: '',
    displayOrder: 0,
    isActive: true
  });

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (status === 'authenticated') {
      fetchSubcategories();
    }
  }, [status, router]);

  const fetchSubcategories = async () => {
    try {
      const response = await fetch('/api/extensions/subcategories');
      if (response.ok) {
        const data = await response.json();
        setSubcategories(data.subcategories);
      } else {
        toast.error('Failed to fetch subcategories');
      }
    } catch (error) {
      console.error('Error fetching subcategories:', error);
      toast.error('Error loading subcategories');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdd = () => {
    setFormData({
      code: '',
      name: '',
      description: '',
      displayOrder: subcategories.length + 1,
      isActive: true
    });
    setShowAddDialog(true);
  };

  const handleEdit = (subcategory: ExtensionSubcategory) => {
    setSelectedSubcategory(subcategory);
    setFormData({
      code: subcategory.code,
      name: subcategory.name,
      description: subcategory.description,
      displayOrder: subcategory.displayOrder,
      isActive: subcategory.isActive
    });
    setShowEditDialog(true);
  };

  const handleDelete = (subcategory: ExtensionSubcategory) => {
    setSelectedSubcategory(subcategory);
    setShowDeleteDialog(true);
  };

  const handleSubmitAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      const response = await fetch('/api/extensions/subcategories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        toast.success('Subcategory added successfully');
        setShowAddDialog(false);
        fetchSubcategories();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to add subcategory');
      }
    } catch (error) {
      console.error('Error adding subcategory:', error);
      toast.error('Error adding subcategory');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubcategory) return;

    setIsSaving(true);

    try {
      const response = await fetch(`/api/extensions/subcategories/${selectedSubcategory.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        toast.success('Subcategory updated successfully');
        setShowEditDialog(false);
        fetchSubcategories();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to update subcategory');
      }
    } catch (error) {
      console.error('Error updating subcategory:', error);
      toast.error('Error updating subcategory');
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!selectedSubcategory) return;

    setIsSaving(true);

    try {
      const response = await fetch(`/api/extensions/subcategories/${selectedSubcategory.id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        toast.success('Subcategory deleted successfully');
        setShowDeleteDialog(false);
        fetchSubcategories();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to delete subcategory');
      }
    } catch (error) {
      console.error('Error deleting subcategory:', error);
      toast.error('Error deleting subcategory');
    } finally {
      setIsSaving(false);
    }
  };

  if (status === 'loading' || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading subcategories...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <FileBarChart className="h-8 w-8 text-blue-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Extension Subcategories
                </h1>
                <p className="text-sm text-gray-600">
                  Manage GCC 17A extension subcategories
                </p>
              </div>
            </div>
            <Button onClick={handleAdd}>
              <Plus className="h-4 w-4 mr-2" />
              Add Subcategory
            </Button>
          </div>
        </div>

        {/* Info Card */}
        <Card className="mb-6 border-blue-200 bg-blue-50">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-900">
                <p className="font-medium mb-1">About Extension Subcategories</p>
                <p>
                  These subcategories are used for GCC Clause 17A extensions (extensions without liquidated damages).
                  Each subcategory represents a different reason or basis for granting a time extension.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Subcategories List */}
        <div className="grid gap-4">
          {subcategories.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center py-12">
                <FileBarChart className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  No Subcategories Found
                </h3>
                <p className="text-gray-600 mb-4">
                  Add your first extension subcategory to get started.
                </p>
                <Button onClick={handleAdd}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add First Subcategory
                </Button>
              </CardContent>
            </Card>
          ) : (
            subcategories.map((subcategory) => (
              <Card key={subcategory.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <Badge variant="default" className="font-mono text-base px-3 py-1">
                          {subcategory.code}
                        </Badge>
                        <h3 className="text-lg font-semibold text-gray-900">
                          {subcategory.name}
                        </h3>
                        {!subcategory.isActive && (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mb-2">
                        {subcategory.description}
                      </p>
                      <p className="text-xs text-gray-500">
                        Display Order: {subcategory.displayOrder}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(subcategory)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(subcategory)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* Add Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Extension Subcategory</DialogTitle>
            <DialogDescription>
              Create a new subcategory for GCC 17A extensions
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmitAdd} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">Code (e.g., I, II, III) *</Label>
              <Input
                id="code"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                placeholder="I"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Subcategory I"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe when this subcategory should be used..."
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="displayOrder">Display Order</Label>
              <Input
                id="displayOrder"
                type="number"
                value={formData.displayOrder}
                onChange={(e) => setFormData({ ...formData, displayOrder: parseInt(e.target.value) })}
                required
              />
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="isActive"
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
              />
              <Label htmlFor="isActive">Active</Label>
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAddDialog(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? 'Adding...' : 'Add Subcategory'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Extension Subcategory</DialogTitle>
            <DialogDescription>
              Update the subcategory details
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmitEdit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-code">Code *</Label>
              <Input
                id="edit-code"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name *</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-displayOrder">Display Order</Label>
              <Input
                id="edit-displayOrder"
                type="number"
                value={formData.displayOrder}
                onChange={(e) => setFormData({ ...formData, displayOrder: parseInt(e.target.value) })}
                required
              />
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="edit-isActive"
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
              />
              <Label htmlFor="edit-isActive">Active</Label>
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowEditDialog(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Subcategory?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the subcategory &quot;{selectedSubcategory?.code} - {selectedSubcategory?.name}&quot;?
              This action cannot be undone and will fail if the subcategory is currently in use by any extensions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={isSaving}
              className="bg-red-600 hover:bg-red-700"
            >
              {isSaving ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

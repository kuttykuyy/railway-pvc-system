
'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BackButton } from '@/components/ui/back-button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { toast } from 'react-hot-toast';
import { Plus, Edit2, Trash2, FileText, Copy, Star, Globe } from 'lucide-react';

interface ReportTemplate {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  isGlobal: boolean;
  sections: {
    contractDetails: boolean;
    workClassification: boolean;
    allBillsTable: boolean;
    monthlyIndices: boolean;
    pvcCalculation: boolean;
    componentIndexDocuments: boolean;
  };
  fields: {
    contractDetails: {
      [key: string]: boolean;
    };
    workClassification: {
      [key: string]: boolean;
    };
    pvcCalculation: {
      [key: string]: boolean;
    };
  };
  createdAt: string;
  updatedAt: string;
  user?: {
    name: string;
    role: string;
  };
}

export default function ReportTemplatesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ReportTemplate | null>(null);
  const [formData, setFormData] = useState<{
    name: string;
    description: string;
    isDefault: boolean;
    isGlobal: boolean;
    sections: {
      contractDetails: boolean;
      workClassification: boolean;
      allBillsTable: boolean;
      monthlyIndices: boolean;
      pvcCalculation: boolean;
      componentIndexDocuments: boolean;
    };
    fields: {
      contractDetails: any;
      workClassification: any;
      pvcCalculation: any;
    };
  }>({
    name: '',
    description: '',
    isDefault: false,
    isGlobal: false,
    sections: {
      contractDetails: true,
      workClassification: true,
      allBillsTable: true,
      monthlyIndices: true,
      pvcCalculation: true,
      componentIndexDocuments: true
    },
    fields: {
      contractDetails: {
        agreementNo: true,
        loaNo: true,
        contractorName: true,
        workDescription: true,
        dateOfOpening: true,
        baseMonth: true,
        pvcNumber: true,
        isFinalPvc: true,
        zone: true
      },
      workClassification: {
        code: true,
        name: true,
        description: true,
        componentBreakdown: true,
        subClassifications: true,
        nonScheduleItems: true
      },
      pvcCalculation: {
        componentWise: true,
        dedicatedAmounts: true,
        summary: true,
        quarterlyData: true
      }
    }
  });

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (status === 'authenticated') {
      fetchTemplates();
    }
  }, [status, router]);

  const fetchTemplates = async () => {
    try {
      const response = await fetch('/api/report-templates');
      if (response.ok) {
        const data = await response.json();
        setTemplates(data);
      } else {
        toast.error('Failed to fetch templates');
      }
    } catch (error) {
      console.error('Error fetching templates:', error);
      toast.error('An error occurred while fetching templates');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingTemplate(null);
    setFormData({
      name: '',
      description: '',
      isDefault: false,
      isGlobal: false,
      sections: {
        contractDetails: true,
        workClassification: true,
        allBillsTable: true,
        monthlyIndices: true,
        pvcCalculation: true,
        componentIndexDocuments: true
      },
      fields: {
        contractDetails: {
          agreementNo: true,
          loaNo: true,
          contractorName: true,
          workDescription: true,
          dateOfOpening: true,
          baseMonth: true,
          pvcNumber: true,
          isFinalPvc: true,
          zone: true
        },
        workClassification: {
          code: true,
          name: true,
          description: true,
          componentBreakdown: true,
          subClassifications: true,
          nonScheduleItems: true
        },
        pvcCalculation: {
          componentWise: true,
          dedicatedAmounts: true,
          summary: true,
          quarterlyData: true,
          showCalculationSteps: true
        }
      }
    });
    setShowDialog(true);
  };

  const handleEdit = (template: ReportTemplate) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      description: template.description || '',
      isDefault: template.isDefault,
      isGlobal: template.isGlobal || false,
      sections: template.sections,
      fields: template.fields
    });
    setShowDialog(true);
  };

  const handleDuplicate = (template: ReportTemplate) => {
    setEditingTemplate(null);
    setFormData({
      name: `${template.name} (Copy)`,
      description: template.description || '',
      isDefault: false,
      isGlobal: false,
      sections: template.sections,
      fields: template.fields
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('Template name is required');
      return;
    }

    try {
      const url = editingTemplate 
        ? `/api/report-templates/${editingTemplate.id}`
        : '/api/report-templates';
      
      const method = editingTemplate ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        toast.success(editingTemplate ? 'Template updated successfully' : 'Template created successfully');
        setShowDialog(false);
        fetchTemplates();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to save template');
      }
    } catch (error) {
      console.error('Error saving template:', error);
      toast.error('An error occurred while saving the template');
    }
  };

  const handleDelete = async (templateId: string) => {
    if (!confirm('Are you sure you want to delete this template?')) {
      return;
    }

    try {
      const response = await fetch(`/api/report-templates/${templateId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        toast.success('Template deleted successfully');
        fetchTemplates();
      } else {
        toast.error('Failed to delete template');
      }
    } catch (error) {
      console.error('Error deleting template:', error);
      toast.error('An error occurred while deleting the template');
    }
  };

  const handleSetDefault = async (templateId: string) => {
    try {
      const template = templates.find(t => t.id === templateId);
      if (!template) return;

      const response = await fetch(`/api/report-templates/${templateId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...template, isDefault: true })
      });

      if (response.ok) {
        toast.success('Default template updated');
        fetchTemplates();
      } else {
        toast.error('Failed to update default template');
      }
    } catch (error) {
      console.error('Error updating default template:', error);
      toast.error('An error occurred');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="mt-2 text-sm text-muted-foreground">Loading templates...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <BackButton href="/dashboard" className="mb-4" />
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Report Templates</h1>
          <p className="text-muted-foreground mt-1">
            Customize which sections and fields appear in your PDF reports
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Create Template
        </Button>
      </div>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No templates yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create your first report template to customize PDF generation
            </p>
            <Button onClick={handleCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Create Template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <Card key={template.id} className={template.isDefault ? 'border-primary' : ''}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <CardTitle className="flex items-center gap-2">
                      {template.name}
                      {template.isDefault && (
                        <Star className="h-4 w-4 fill-primary text-primary" />
                      )}
                      {template.isGlobal && (
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full font-normal">
                          <Globe className="h-3 w-3" />
                          Global
                        </span>
                      )}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {template.description || 'No description'}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div>
                    <h5 className="text-sm font-semibold mb-2">Sections Included:</h5>
                    <div className="flex flex-wrap gap-2">
                      {template.sections.contractDetails && (
                        <span className="px-2 py-1 bg-primary/10 text-primary text-xs rounded">
                          Contract Details
                        </span>
                      )}
                      {template.sections.workClassification && (
                        <span className="px-2 py-1 bg-primary/10 text-primary text-xs rounded">
                          Classification
                        </span>
                      )}
                      {template.sections.allBillsTable && (
                        <span className="px-2 py-1 bg-primary/10 text-primary text-xs rounded">
                          All Bills
                        </span>
                      )}
                      {template.sections.monthlyIndices && (
                        <span className="px-2 py-1 bg-primary/10 text-primary text-xs rounded">
                          Monthly Indices
                        </span>
                      )}
                      {template.sections.pvcCalculation && (
                        <span className="px-2 py-1 bg-primary/10 text-primary text-xs rounded">
                          PVC Calculation
                        </span>
                      )}
                      {template.sections.componentIndexDocuments && (
                        <span className="px-2 py-1 bg-primary/10 text-primary text-xs rounded">
                          Index Documents
                        </span>
                      )}
                    </div>
                  </div>

                  <Separator />

                  <div className="flex gap-2">
                    {!template.isDefault && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSetDefault(template.id)}
                        className="flex-1"
                      >
                        <Star className="h-3 w-3 mr-1" />
                        Set Default
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEdit(template)}
                      className="flex-1"
                    >
                      <Edit2 className="h-3 w-3 mr-1" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDuplicate(template)}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDelete(template.id)}
                      className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? 'Edit Template' : 'Create New Template'}
            </DialogTitle>
            <DialogDescription>
              Customize which sections and fields appear in your PDF reports
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Template Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Full Report, Summary Report, Client Report"
                />
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description of this template"
                  rows={2}
                />
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="isDefault"
                  checked={formData.isDefault}
                  onCheckedChange={(checked) => setFormData({ ...formData, isDefault: checked })}
                />
                <Label htmlFor="isDefault">Set as default template</Label>
              </div>

              {session?.user?.role === 'admin' && (
                <div className="flex items-center space-x-2">
                  <Switch
                    id="isGlobal"
                    checked={formData.isGlobal}
                    onCheckedChange={(checked) => setFormData({ ...formData, isGlobal: checked })}
                  />
                  <Label htmlFor="isGlobal" className="flex items-center gap-2">
                    Make Global (Visible to All Users)
                    <span className="text-xs text-muted-foreground">(Admin Only)</span>
                  </Label>
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-4">
              <h4 className="font-semibold">Report Sections</h4>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="section-contract">Contract Details</Label>
                    <p className="text-xs text-muted-foreground">Agreement info, contractor, dates</p>
                  </div>
                  <Switch
                    id="section-contract"
                    checked={formData.sections.contractDetails}
                    onCheckedChange={(checked) =>
                      setFormData({
                        ...formData,
                        sections: { ...formData.sections, contractDetails: checked }
                      })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="section-classification">Work Classification</Label>
                    <p className="text-xs text-muted-foreground">Component breakdown and sub-classifications</p>
                  </div>
                  <Switch
                    id="section-classification"
                    checked={formData.sections.workClassification}
                    onCheckedChange={(checked) =>
                      setFormData({
                        ...formData,
                        sections: { ...formData.sections, workClassification: checked }
                      })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="section-bills">All Bills Table</Label>
                    <p className="text-xs text-muted-foreground">Summary of all bills for this contract</p>
                  </div>
                  <Switch
                    id="section-bills"
                    checked={formData.sections.allBillsTable}
                    onCheckedChange={(checked) =>
                      setFormData({
                        ...formData,
                        sections: { ...formData.sections, allBillsTable: checked }
                      })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="section-indices">Monthly Price Indices</Label>
                    <p className="text-xs text-muted-foreground">Detailed monthly index values</p>
                  </div>
                  <Switch
                    id="section-indices"
                    checked={formData.sections.monthlyIndices}
                    onCheckedChange={(checked) =>
                      setFormData({
                        ...formData,
                        sections: { ...formData.sections, monthlyIndices: checked }
                      })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="section-pvc">PVC Calculation</Label>
                    <p className="text-xs text-muted-foreground">Component-wise PVC breakdown</p>
                  </div>
                  <Switch
                    id="section-pvc"
                    checked={formData.sections.pvcCalculation}
                    onCheckedChange={(checked) =>
                      setFormData({
                        ...formData,
                        sections: { ...formData.sections, pvcCalculation: checked }
                      })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="section-component-docs">Component Index Documents</Label>
                    <p className="text-xs text-muted-foreground">Uploaded price index PDFs (Labour, Cement, Steel, etc.)</p>
                  </div>
                  <Switch
                    id="section-component-docs"
                    checked={formData.sections.componentIndexDocuments}
                    onCheckedChange={(checked) =>
                      setFormData({
                        ...formData,
                        sections: { ...formData.sections, componentIndexDocuments: checked }
                      })
                    }
                  />
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <h4 className="font-semibold">Contract Details Fields</h4>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(formData.fields.contractDetails).map(([key, value]) => (
                  <div key={key} className="flex items-center space-x-2">
                    <Switch
                      checked={value as boolean}
                      onCheckedChange={(checked) =>
                        setFormData({
                          ...formData,
                          fields: {
                            ...formData.fields,
                            contractDetails: {
                              ...formData.fields.contractDetails,
                              [key]: checked
                            }
                          }
                        })
                      }
                    />
                    <Label className="text-sm capitalize">
                      {key.replace(/([A-Z])/g, ' $1').trim()}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <h4 className="font-semibold">Work Classification Fields</h4>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(formData.fields.workClassification).map(([key, value]) => (
                  <div key={key} className="flex items-center space-x-2">
                    <Switch
                      checked={value as boolean}
                      onCheckedChange={(checked) =>
                        setFormData({
                          ...formData,
                          fields: {
                            ...formData.fields,
                            workClassification: {
                              ...formData.fields.workClassification,
                              [key]: checked
                            }
                          }
                        })
                      }
                    />
                    <Label className="text-sm capitalize">
                      {key.replace(/([A-Z])/g, ' $1').trim()}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <h4 className="font-semibold">PVC Calculation Fields</h4>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(formData.fields.pvcCalculation).map(([key, value]) => (
                  <div key={key} className="flex items-center space-x-2">
                    <Switch
                      checked={value as boolean}
                      onCheckedChange={(checked) =>
                        setFormData({
                          ...formData,
                          fields: {
                            ...formData.fields,
                            pvcCalculation: {
                              ...formData.fields.pvcCalculation,
                              [key]: checked
                            }
                          }
                        })
                      }
                    />
                    <Label className="text-sm">
                      {key === 'showCalculationSteps' 
                        ? 'Show Detailed Calculation Steps' 
                        : key.replace(/([A-Z])/g, ' $1').trim().replace(/^./, str => str.toUpperCase())}
                    </Label>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                💡 <strong>Show Detailed Calculation Steps:</strong> When enabled, the PDF will include step-by-step calculation breakdowns for each PVC component (Labour, Plant & Machinery, Fuel, Materials, Cement, Steel, etc.)
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              {editingTemplate ? 'Update Template' : 'Create Template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

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
import { Plus, Edit2, Trash2, FileText, Copy, Star, Globe, Sparkles, LayoutList, Settings } from 'lucide-react';

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
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <FileText className="h-8 w-8 text-emerald-600 animate-pulse mx-auto" />
          <p className="text-sm text-slate-500">Loading templates...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen pb-12 space-y-8 overflow-hidden">
      {/* Background Blurs */}
      <div className="absolute top-0 right-10 w-96 h-96 bg-emerald-300/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute top-1/3 -left-20 w-80 h-80 bg-emerald-300/10 blur-[100px] rounded-full pointer-events-none" />
      <div className="absolute bottom-10 right-20 w-[450px] h-[450px] bg-emerald-300/5 blur-[150px] rounded-full pointer-events-none" />

      <BackButton href="/dashboard" className="mb-4 inline-flex items-center text-slate-500 hover:text-slate-800" />
      
      {/* Header Container */}
      <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6 p-8 bg-white/80 backdrop-blur-xl border border-slate-200/50 rounded-3xl shadow-[0_10px_40px_rgba(0,0,0,0.03)] overflow-hidden">
        <div className="absolute inset-0 bg-grid-slate-900/[0.01] pointer-events-none" />
        <div className="relative space-y-2">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/50 rounded-full shadow-sm">
            <Sparkles className="h-3 w-3 text-emerald-600" />
            PDF Customization Panel
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 bg-clip-text text-transparent">
            Report Templates
          </h1>
          <p className="text-sm text-slate-500 max-w-lg font-normal">
            Customize which sections and data fields appear in your final PDF report outputs.
          </p>
        </div>
        
        <Button onClick={handleCreate} className="h-11 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-500/10 transition-colors cursor-pointer shrink-0">
          <Plus className="h-4 w-4 mr-2" />
          Create Template
        </Button>
      </div>

      {templates.length === 0 ? (
        <Card className="border border-slate-100 bg-white/70 backdrop-blur-md shadow-[0_15px_35px_rgba(0,0,0,0.02)] rounded-3xl overflow-hidden">
          <CardContent className="flex flex-col items-center justify-center py-20 text-center space-y-4">
            <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl text-slate-400">
              <FileText className="h-10 w-10 text-slate-400" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xl font-bold text-slate-800">No templates yet</h3>
              <p className="text-sm text-slate-500 max-w-sm font-light">
                Create your first report template to customize how PDFs are formatted and generated.
              </p>
            </div>
            <Button onClick={handleCreate} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl">
              <Plus className="h-4 w-4 mr-2" />
              Create Template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <Card key={template.id} className={`group relative overflow-hidden border bg-white/75 backdrop-blur-md shadow-[0_15px_35px_rgba(0,0,0,0.015)] rounded-3xl transition-all duration-300 transform hover:-translate-y-1 hover:border-slate-200 hover:shadow-lg ${template.isDefault ? 'border-emerald-200 ring-2 ring-emerald-500/5' : 'border-slate-100'}`}>
              <CardHeader className="p-6 pb-4">
                <div className="flex justify-between items-start gap-4">
                  <div className="space-y-1">
                    <CardTitle className="text-lg font-bold text-slate-800 flex flex-wrap items-center gap-2">
                      {template.name}
                      {template.isDefault && (
                        <Star className="h-4.5 w-4.5 fill-amber-400 text-amber-500 shrink-0" />
                      )}
                      {template.isGlobal && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-emerald-50 border border-emerald-200/50 text-emerald-700 text-[10px] font-bold rounded-full">
                          <Globe className="h-3 w-3" />
                          Global
                        </span>
                      )}
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-500 font-light leading-relaxed">
                      {template.description || 'No description provided'}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-6 pt-0 space-y-4">
                <div className="space-y-3">
                  <div>
                    <h5 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Sections Included:</h5>
                    <div className="flex flex-wrap gap-1.5">
                      {template.sections.contractDetails && (
                        <span className="px-2 py-0.5 bg-emerald-50 border border-emerald-100/50 text-emerald-700 text-[10px] font-semibold rounded-lg">
                          Contract Details
                        </span>
                      )}
                      {template.sections.workClassification && (
                        <span className="px-2 py-0.5 bg-emerald-50 border border-emerald-100/50 text-emerald-700 text-[10px] font-semibold rounded-lg">
                          Classification
                        </span>
                      )}
                      {template.sections.allBillsTable && (
                        <span className="px-2 py-0.5 bg-emerald-50 border border-emerald-100/50 text-emerald-700 text-[10px] font-semibold rounded-lg">
                          All Bills
                        </span>
                      )}
                      {template.sections.monthlyIndices && (
                        <span className="px-2 py-0.5 bg-emerald-50 border border-emerald-100/50 text-emerald-700 text-[10px] font-semibold rounded-lg">
                          Monthly Indices
                        </span>
                      )}
                      {template.sections.pvcCalculation && (
                        <span className="px-2 py-0.5 bg-emerald-50 border border-emerald-100/50 text-emerald-700 text-[10px] font-semibold rounded-lg">
                          PVC Details
                        </span>
                      )}
                      {template.sections.componentIndexDocuments && (
                        <span className="px-2 py-0.5 bg-emerald-50 border border-emerald-100/50 text-emerald-700 text-[10px] font-semibold rounded-lg">
                          Index Docs
                        </span>
                      )}
                    </div>
                  </div>

                  <Separator className="bg-slate-100" />

                  <div className="flex items-center gap-2 pt-1">
                    {!template.isDefault && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSetDefault(template.id)}
                        className="flex-1 bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 rounded-xl h-9 text-xs font-semibold cursor-pointer transition-colors"
                      >
                        <Star className="h-3.5 w-3.5 mr-1 text-amber-500" />
                        Set Default
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEdit(template)}
                      className="flex-1 bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900 rounded-xl h-9 text-xs font-semibold cursor-pointer transition-colors"
                    >
                      <Edit2 className="h-3.5 w-3.5 mr-1 text-slate-500" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDuplicate(template)}
                      className="bg-slate-50 border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800 rounded-xl h-9 w-9 p-0 cursor-pointer transition-colors"
                    >
                      <Copy className="h-3.5 w-3.5 mx-auto" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDelete(template.id)}
                      className="bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100 hover:text-rose-700 rounded-xl h-9 w-9 p-0 cursor-pointer transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5 mx-auto" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* dialog modal */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-white border border-slate-200/80 rounded-3xl p-8 shadow-2xl">
          <DialogHeader className="space-y-1.5 pb-4 border-b border-slate-100">
            <DialogTitle className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <div className="p-1.5 bg-emerald-50 border border-emerald-100 rounded-lg text-emerald-600"><LayoutList className="h-5 w-5" /></div>
              {editingTemplate ? 'Edit Template Parameters' : 'Create Custom PDF Template'}
            </DialogTitle>
            <DialogDescription className="text-slate-500 text-sm">
              Define which billing columns, document components, and index details appear on exported PVC PDFs.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-6">
            {/* Basic parameters */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-sm font-semibold text-slate-700">Template Identifier Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Full Audited PDF, Quick Client Abstract, Internal Summary"
                  className="bg-slate-50/50 border border-slate-200 text-slate-800 placeholder-slate-400 rounded-xl focus:bg-white focus:ring-emerald-500/10 focus:border-emerald-500/50 h-11 transition-all"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description" className="text-sm font-semibold text-slate-700">Detailed Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe when to generate reports using this template format..."
                  rows={2}
                  className="bg-slate-50/50 border border-slate-200 text-slate-800 placeholder-slate-400 rounded-xl focus:bg-white focus:ring-emerald-500/10 focus:border-emerald-500/50 transition-all p-3"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                {/* Default Toggle */}
                <div className="flex items-center justify-between p-4 border border-slate-100 bg-slate-50/20 rounded-xl hover:bg-slate-50/40 transition-colors">
                  <div className="space-y-0.5">
                    <Label htmlFor="isDefault" className="text-sm font-semibold text-slate-700">Set as default template</Label>
                    <p className="text-xs text-slate-400 font-light">Auto-selects for all PDF downloads.</p>
                  </div>
                  <Switch
                    id="isDefault"
                    checked={formData.isDefault}
                    onCheckedChange={(checked) => setFormData({ ...formData, isDefault: checked })}
                  />
                </div>

                {/* Global Toggle (Admin only) */}
                {session?.user?.role === 'admin' && (
                  <div className="flex items-center justify-between p-4 border border-slate-100 bg-slate-50/20 rounded-xl hover:bg-slate-50/40 transition-colors">
                    <div className="space-y-0.5">
                      <Label htmlFor="isGlobal" className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                        Global Template <span className="text-[9px] font-bold bg-emerald-50 border border-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">Admin Only</span>
                      </Label>
                      <p className="text-xs text-slate-400 font-light">Visually available to all system users.</p>
                    </div>
                    <Switch
                      id="isGlobal"
                      checked={formData.isGlobal}
                      onCheckedChange={(checked) => setFormData({ ...formData, isGlobal: checked })}
                    />
                  </div>
                )}
              </div>
            </div>

            <Separator className="bg-slate-100" />

            {/* Sections Toggle */}
            <div className="space-y-4">
              <h4 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Settings className="h-4.5 w-4.5 text-emerald-600" /> Include Report Sections
              </h4>
              
              <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
                <div className="flex items-center justify-between p-4 border border-slate-100 bg-slate-50/20 rounded-2xl hover:bg-slate-50/40 transition-colors">
                  <div className="space-y-0.5 pr-2">
                    <Label htmlFor="section-contract" className="text-sm font-semibold text-slate-700">Contract details information</Label>
                    <p className="text-xs text-slate-400 font-light">Agreement identification, contractor name, date thresholds.</p>
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

                <div className="flex items-center justify-between p-4 border border-slate-100 bg-slate-50/20 rounded-2xl hover:bg-slate-50/40 transition-colors">
                  <div className="space-y-0.5 pr-2">
                    <Label htmlFor="section-classification" className="text-sm font-semibold text-slate-700">Work Classification categories</Label>
                    <p className="text-xs text-slate-400 font-light">GCC work categories breakdown, scheduling percentages.</p>
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

                <div className="flex items-center justify-between p-4 border border-slate-100 bg-slate-50/20 rounded-2xl hover:bg-slate-50/40 transition-colors">
                  <div className="space-y-0.5 pr-2">
                    <Label htmlFor="section-bills" className="text-sm font-semibold text-slate-700">All Bills Summary list</Label>
                    <p className="text-xs text-slate-400 font-light">Chronological spreadsheet listing all processed bills.</p>
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

                <div className="flex items-center justify-between p-4 border border-slate-100 bg-slate-50/20 rounded-2xl hover:bg-slate-50/40 transition-colors">
                  <div className="space-y-0.5 pr-2">
                    <Label htmlFor="section-indices" className="text-sm font-semibold text-slate-700">Monthly Price Index values</Label>
                    <p className="text-xs text-slate-400 font-light">Labour, Fuel, Steel index indicators grid.</p>
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

                <div className="flex items-center justify-between p-4 border border-slate-100 bg-slate-50/20 rounded-2xl hover:bg-slate-50/40 transition-colors">
                  <div className="space-y-0.5 pr-2">
                    <Label htmlFor="section-pvc" className="text-sm font-semibold text-slate-700">PVC Calculation breakdown</Label>
                    <p className="text-xs text-slate-400 font-light">Component wise variation amounts details sheet.</p>
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

                <div className="flex items-center justify-between p-4 border border-slate-100 bg-slate-50/20 rounded-2xl hover:bg-slate-50/40 transition-colors">
                  <div className="space-y-0.5 pr-2">
                    <Label htmlFor="section-component-docs" className="text-sm font-semibold text-slate-700">Price Index verification PDFs</Label>
                    <p className="text-xs text-slate-400 font-light">Append uploaded index sheets at report annexures.</p>
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

            <Separator className="bg-slate-100" />

            {/* Contract Details Fields */}
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Contract Details - Toggle Fields</h4>
              <div className="p-5 bg-slate-50/30 border border-slate-100 rounded-2xl grid grid-cols-2 gap-4">
                {Object.entries(formData.fields.contractDetails).map(([key, value]) => (
                  <div key={key} className="flex items-center space-x-3">
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
                    <Label className="text-xs font-semibold text-slate-600 capitalize cursor-pointer">
                      {key.replace(/([A-Z])/g, ' $1').trim()}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <Separator className="bg-slate-100" />

            {/* Work Classification Fields */}
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Work Classification - Toggle Fields</h4>
              <div className="p-5 bg-slate-50/30 border border-slate-100 rounded-2xl grid grid-cols-2 gap-4">
                {Object.entries(formData.fields.workClassification).map(([key, value]) => (
                  <div key={key} className="flex items-center space-x-3">
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
                    <Label className="text-xs font-semibold text-slate-600 capitalize cursor-pointer">
                      {key.replace(/([A-Z])/g, ' $1').trim()}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <Separator className="bg-slate-100" />

            {/* Calculation details toggles */}
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider">PVC Calculation - Toggle Fields</h4>
              <div className="p-5 bg-slate-50/30 border border-slate-100 rounded-2xl space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {Object.entries(formData.fields.pvcCalculation).map(([key, value]) => (
                    key !== 'showCalculationSteps' && (
                      <div key={key} className="flex items-center space-x-3" style={{ contentVisibility: 'auto' }}>
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
                        <Label className="text-xs font-semibold text-slate-600 capitalize cursor-pointer">
                          {key.replace(/([A-Z])/g, ' $1').trim()}
                        </Label>
                      </div>
                    )
                  ))}
                </div>

                <Separator className="bg-slate-100/50" />

                {/* Show detailed calculation steps toggle */}
                {Object.entries(formData.fields.pvcCalculation).map(([key, value]) => (
                  key === 'showCalculationSteps' && (
                    <div key={key} className="flex items-start justify-between p-4 border border-emerald-100/60 bg-emerald-50/20 rounded-xl gap-4">
                      <div className="space-y-1">
                        <Label htmlFor={key} className="text-sm font-bold text-emerald-950 flex items-center gap-1.5 cursor-pointer">
                          <Sparkles className="h-4 w-4 text-emerald-600" /> Show Detailed Calculation Steps
                        </Label>
                        <p className="text-xs text-slate-500 font-light leading-normal">
                          Appends algebraic calculation steps (formula values, indexes, differences) for each index component in final reports.
                        </p>
                      </div>
                      <Switch
                        id={key}
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
                        className="mt-1"
                      />
                    </div>
                  )
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="pt-4 border-t border-slate-100 gap-2">
            <Button variant="outline" onClick={() => setShowDialog(false)} className="border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl h-11 px-5">
              Cancel
            </Button>
            <Button onClick={handleSave} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-11 px-6 shadow-md shadow-emerald-500/10 cursor-pointer">
              {editingTemplate ? 'Update Template' : 'Create Template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

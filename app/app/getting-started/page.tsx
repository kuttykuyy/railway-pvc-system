'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BackButton } from '@/components/ui/back-button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  BookOpen, 
  UserPlus,
  FileText, 
  Calculator, 
  Building2, 
  TrendingUp,
  Receipt,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Lightbulb,
  AlertCircle,
  ClipboardList,
  Download,
  BarChart3,
  Shield,
  Clock,
  IndianRupee,
  Calendar,
  Layers,
  MousePointerClick,
  Menu,
  Home,
  Settings,
  Users,
  HelpCircle,
  Play
} from 'lucide-react';
import Link from 'next/link';

const StepCard = ({ 
  stepNumber, 
  title, 
  description, 
  tips, 
  action,
  actionLink,
  icon: Icon 
}: { 
  stepNumber: number; 
  title: string; 
  description: string; 
  tips?: string[];
  action?: string;
  actionLink?: string;
  icon: React.ElementType;
}) => (
  <Card className="border-l-4 border-l-blue-500 hover:shadow-lg transition-all duration-300">
    <CardHeader className="pb-3">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
            <span className="text-xl font-bold text-blue-600">{stepNumber}</span>
          </div>
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Icon className="h-5 w-5 text-blue-600" />
            <CardTitle className="text-lg">{title}</CardTitle>
          </div>
          <CardDescription className="text-sm leading-relaxed">{description}</CardDescription>
        </div>
      </div>
    </CardHeader>
    {(tips || action) && (
      <CardContent className="pt-0 pl-20">
        {tips && tips.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
            <div className="flex items-start gap-2">
              <Lightbulb className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-800 mb-1">Pro Tip</p>
                <ul className="text-sm text-amber-700 space-y-1">
                  {tips.map((tip, i) => (
                    <li key={i} className="flex items-start gap-1">
                      <ChevronRight className="h-3 w-3 mt-1 flex-shrink-0" />
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
        {action && actionLink && (
          <Link href={actionLink}>
            <Button size="sm" className="gap-2">
              {action}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        )}
      </CardContent>
    )}
  </Card>
);

const FeatureCard = ({ 
  title, 
  description, 
  icon: Icon,
  color = 'blue'
}: { 
  title: string; 
  description: string; 
  icon: React.ElementType;
  color?: string;
}) => {
  const colorClasses = {
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
    purple: 'bg-purple-100 text-purple-600',
    orange: 'bg-orange-100 text-orange-600',
    red: 'bg-red-100 text-red-600',
  };
  
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg ${colorClasses[color as keyof typeof colorClasses]}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h4 className="font-semibold text-sm mb-1">{title}</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const WorkflowStep = ({ 
  step, 
  title, 
  isActive = false,
  isCompleted = false 
}: { 
  step: number; 
  title: string; 
  isActive?: boolean;
  isCompleted?: boolean;
}) => (
  <div className="flex items-center gap-2">
    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
      isCompleted 
        ? 'bg-green-500 text-white' 
        : isActive 
          ? 'bg-blue-500 text-white' 
          : 'bg-gray-200 text-gray-600'
    }`}>
      {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : step}
    </div>
    <span className={`text-sm ${isActive ? 'font-semibold text-blue-600' : 'text-gray-600'}`}>
      {title}
    </span>
  </div>
);

export default function GettingStartedPage() {
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div className="container mx-auto px-4 py-6 max-w-5xl">
      {/* Header */}
      <div className="mb-8">
        <BackButton href="/dashboard" />
        <div className="flex items-center gap-3 mt-4 mb-2">
          <div className="p-3 bg-blue-100 rounded-xl">
            <BookOpen className="h-8 w-8 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Getting Started Guide</h1>
            <p className="text-muted-foreground">Complete guide for first-time users of IR-PVC System</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          <Badge variant="outline" className="gap-1">
            <Clock className="h-3 w-3" />
            15 min read
          </Badge>
          <Badge variant="outline" className="gap-1 bg-green-50 text-green-700 border-green-200">
            <CheckCircle2 className="h-3 w-3" />
            Beginner Friendly
          </Badge>
        </div>
      </div>

      {/* Quick Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-8">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5 h-auto">
          <TabsTrigger value="overview" className="text-xs sm:text-sm py-2">
            <Home className="h-4 w-4 mr-1 sm:mr-2" />
            <span className="hidden sm:inline">Overview</span>
            <span className="sm:hidden">Home</span>
          </TabsTrigger>
          <TabsTrigger value="contracts" className="text-xs sm:text-sm py-2">
            <Building2 className="h-4 w-4 mr-1 sm:mr-2" />
            Contracts
          </TabsTrigger>
          <TabsTrigger value="bills" className="text-xs sm:text-sm py-2">
            <Receipt className="h-4 w-4 mr-1 sm:mr-2" />
            Bills
          </TabsTrigger>
          <TabsTrigger value="reports" className="text-xs sm:text-sm py-2">
            <FileText className="h-4 w-4 mr-1 sm:mr-2" />
            Reports
          </TabsTrigger>
          <TabsTrigger value="tips" className="text-xs sm:text-sm py-2">
            <Lightbulb className="h-4 w-4 mr-1 sm:mr-2" />
            Tips
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-6 space-y-8">
          {/* What is IR-PVC */}
          <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-blue-600" />
                What is IR-PVC System?
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-gray-700 leading-relaxed">
                The <strong>Indian Railway Price Variation Clause (IR-PVC) System</strong> is a digital platform 
                that automates the calculation of price adjustments for railway construction contracts. When material 
                and labor prices change during your contract period, this system ensures you receive fair compensation.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                <div className="bg-white/80 rounded-lg p-4 text-center">
                  <IndianRupee className="h-8 w-8 text-green-600 mx-auto mb-2" />
                  <h4 className="font-semibold text-sm">Automatic PVC Calculation</h4>
                  <p className="text-xs text-muted-foreground">No manual calculations needed</p>
                </div>
                <div className="bg-white/80 rounded-lg p-4 text-center">
                  <FileText className="h-8 w-8 text-blue-600 mx-auto mb-2" />
                  <h4 className="font-semibold text-sm">Professional Reports</h4>
                  <p className="text-xs text-muted-foreground">Railway-compliant PDF reports</p>
                </div>
                <div className="bg-white/80 rounded-lg p-4 text-center">
                  <TrendingUp className="h-8 w-8 text-purple-600 mx-auto mb-2" />
                  <h4 className="font-semibold text-sm">Latest Price Indices</h4>
                  <p className="text-xs text-muted-foreground">Updated monthly indices</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Workflow Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-blue-600" />
                Your Workflow at a Glance
              </CardTitle>
              <CardDescription>Follow these steps to generate your first PVC bill</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 bg-gray-50 rounded-lg">
                <WorkflowStep step={1} title="Create Account" isCompleted={true} />
                <ArrowRight className="h-4 w-4 text-gray-400 hidden sm:block" />
                <WorkflowStep step={2} title="Add Contract" />
                <ArrowRight className="h-4 w-4 text-gray-400 hidden sm:block" />
                <WorkflowStep step={3} title="Create Bill" />
                <ArrowRight className="h-4 w-4 text-gray-400 hidden sm:block" />
                <WorkflowStep step={4} title="Download Report" />
              </div>
            </CardContent>
          </Card>

          {/* Navigation Guide */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Menu className="h-5 w-5 text-blue-600" />
                Navigating the System
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="border rounded-lg p-4">
                  <h4 className="font-semibold flex items-center gap-2 mb-2">
                    <MousePointerClick className="h-4 w-4 text-blue-500" />
                    Desktop Navigation
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Use the top navigation bar to access all features. Hover over menu items to see dropdown options.
                  </p>
                </div>
                <div className="border rounded-lg p-4">
                  <h4 className="font-semibold flex items-center gap-2 mb-2">
                    <Menu className="h-4 w-4 text-blue-500" />
                    Mobile Navigation
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Tap the hamburger menu (☰) in the top-right corner to open the mobile navigation drawer.
                  </p>
                </div>
              </div>
              
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-semibold text-blue-800 mb-2">Main Menu Sections</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                  <div className="flex items-start gap-2">
                    <Building2 className="h-4 w-4 text-blue-600 mt-0.5" />
                    <div>
                      <p className="font-medium">Contract Management</p>
                      <p className="text-xs text-muted-foreground">Contracts, Bills, Classifications</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <BarChart3 className="h-4 w-4 text-green-600 mt-0.5" />
                    <div>
                      <p className="font-medium">Reports & Analysis</p>
                      <p className="text-xs text-muted-foreground">Reports, Class Analyzer</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Settings className="h-4 w-4 text-purple-600 mt-0.5" />
                    <div>
                      <p className="font-medium">Settings</p>
                      <p className="text-xs text-muted-foreground">Profile, Billing, Help</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quick Start Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Link href="/contracts/new">
              <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 border-dashed border-blue-300 bg-blue-50/50">
                <CardContent className="p-6 text-center">
                  <Building2 className="h-10 w-10 text-blue-600 mx-auto mb-3" />
                  <h3 className="font-semibold text-lg mb-1">Create Your First Contract</h3>
                  <p className="text-sm text-muted-foreground">Start by adding your contract details</p>
                  <Button className="mt-4 gap-2">
                    Get Started <ArrowRight className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            </Link>
            <Link href="/help">
              <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 border-dashed border-green-300 bg-green-50/50">
                <CardContent className="p-6 text-center">
                  <HelpCircle className="h-10 w-10 text-green-600 mx-auto mb-3" />
                  <h3 className="font-semibold text-lg mb-1">Browse Help Center</h3>
                  <p className="text-sm text-muted-foreground">Find answers to common questions</p>
                  <Button variant="outline" className="mt-4 gap-2">
                    View FAQs <ArrowRight className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            </Link>
          </div>
        </TabsContent>

        {/* Contracts Tab */}
        <TabsContent value="contracts" className="mt-6 space-y-6">
          <Card className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <Building2 className="h-8 w-8" />
                <div>
                  <h2 className="text-xl font-bold">Creating & Managing Contracts</h2>
                  <p className="text-blue-100">Your contract is the foundation of all PVC calculations</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <StepCard
              stepNumber={1}
              title="Navigate to Contracts"
              description="From the main menu, click on 'Contracts' in the Contract Management section. This opens your contracts list where you can see all existing contracts or create new ones."
              icon={Menu}
              tips={['Use the search bar to quickly find contracts by agreement number or contractor name']}
            />

            <StepCard
              stepNumber={2}
              title="Click 'New Contract' Button"
              description="Look for the green 'New Contract' button (usually with a + icon) at the top of the contracts page. Click it to open the contract creation form."
              icon={UserPlus}
              action="Create Contract"
              actionLink="/contracts/new"
            />

            <StepCard
              stepNumber={3}
              title="Fill in Contract Details"
              description="Enter the essential contract information including Agreement Number (your official contract reference), Contractor Name, Work Description, and Date of Opening (when the contract started)."
              icon={FileText}
              tips={[
                'The Agreement Number should match your official LOA document',
                'Date of Opening determines your base month for PVC calculations'
              ]}
            />

            <StepCard
              stepNumber={4}
              title="Review and Save"
              description="Double-check all entered information, especially the Date of Opening as it affects all PVC calculations. Click 'Save' or 'Create Contract' to finalize."
              icon={CheckCircle2}
              tips={['You can edit contract details later if needed, but changes to Date of Opening will recalculate all bills']}
            />
          </div>

          {/* Key Terms */}
          <Card className="bg-amber-50 border-amber-200">
            <CardHeader>
              <CardTitle className="text-amber-800 flex items-center gap-2">
                <Lightbulb className="h-5 w-5" />
                Key Terms to Understand
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-3">
                <Badge variant="secondary" className="shrink-0">Agreement No.</Badge>
                <p className="text-sm">The official reference number from your Letter of Acceptance (LOA)</p>
              </div>
              <div className="flex gap-3">
                <Badge variant="secondary" className="shrink-0">Date of Opening</Badge>
                <p className="text-sm">The date your contract officially started - crucial for base month calculation</p>
              </div>
              <div className="flex gap-3">
                <Badge variant="secondary" className="shrink-0">Base Month</Badge>
                <p className="text-sm">Automatically set to one month before Date of Opening - reference point for price comparisons</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Bills Tab */}
        <TabsContent value="bills" className="mt-6 space-y-6">
          <Card className="bg-gradient-to-r from-green-600 to-emerald-600 text-white">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <Receipt className="h-8 w-8" />
                <div>
                  <h2 className="text-xl font-bold">Creating PVC Bills</h2>
                  <p className="text-green-100">Generate running account bills with automatic PVC calculations</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <StepCard
              stepNumber={1}
              title="Go to Bills Section"
              description="Navigate to 'Bills' from the Contract Management menu. You'll see a list of all your bills with options to view, edit, or create new ones."
              icon={Receipt}
            />

            <StepCard
              stepNumber={2}
              title="Click 'New Bill' Button"
              description="Click the green 'New Bill' button to start creating a new running account bill. This opens the bill creation form."
              icon={UserPlus}
              action="Create Bill"
              actionLink="/bills/new"
            />

            <StepCard
              stepNumber={3}
              title="Select Contract & Enter Basic Details"
              description="First, select which contract this bill belongs to. Then enter the Bill Number (your reference), Date of Measurement, and select the Quarter (3-month period the work was done)."
              icon={Calendar}
              tips={[
                'The quarter determines which price indices are used for calculation',
                'Bill numbers should be sequential (1st RA, 2nd RA, etc.)'
              ]}
            />

            <StepCard
              stepNumber={4}
              title="Enter Gross Bill Amount"
              description="Enter the total value of work done in this billing period. This is the full amount before any deductions or adjustments."
              icon={IndianRupee}
            />

            <StepCard
              stepNumber={5}
              title="Add Work Classifications"
              description="This is the most important step. For each type of work (Earthwork, Cement Concrete, Steel Work, etc.), select the classification, choose sub-classifications, and enter the amount for each."
              icon={Layers}
              tips={[
                'You can add multiple classifications for a single bill',
                'Each classification has its own price index for PVC calculation',
                'Make sure amounts match your measurement sheet'
              ]}
            />

            <StepCard
              stepNumber={6}
              title="Add Non-Scheduled Items (Optional)"
              description="If your bill includes items that don't qualify for PVC (fixed-price items), enter them as non-scheduled items. These will be excluded from PVC calculation."
              icon={ClipboardList}
            />

            <StepCard
              stepNumber={7}
              title="Calculate & Save"
              description="Click 'Calculate & Save' to generate the PVC. The system automatically fetches current price indices, compares them with base month indices, and calculates the price variation for each classification."
              icon={Calculator}
              tips={['Review the calculated PVC before saving', 'The cumulative PVC includes all previous bills in this contract']}
            />
          </div>

          {/* PVC Calculation Explanation */}
          <Card className="border-2 border-blue-200">
            <CardHeader className="bg-blue-50">
              <CardTitle className="text-blue-800 flex items-center gap-2">
                <Calculator className="h-5 w-5" />
                How PVC is Calculated
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold">1</div>
                <div className="flex-1">
                  <p className="text-sm"><strong>Net Bill Amount</strong> = Gross Bill Amount - Non-Scheduled Items</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold">2</div>
                <div className="flex-1">
                  <p className="text-sm"><strong>For each classification:</strong> Calculate variation % using current vs base month indices</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold">3</div>
                <div className="flex-1">
                  <p className="text-sm"><strong>PVC Amount</strong> = Classification Amount × Variation %</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                <div className="w-8 h-8 bg-green-500 text-white rounded-full flex items-center justify-center text-sm font-bold">✓</div>
                <div className="flex-1">
                  <p className="text-sm"><strong>Total PVC</strong> = Sum of all classification PVCs + Cumulative PVC from previous bills</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Reports Tab */}
        <TabsContent value="reports" className="mt-6 space-y-6">
          <Card className="bg-gradient-to-r from-purple-600 to-pink-600 text-white">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <FileText className="h-8 w-8" />
                <div>
                  <h2 className="text-xl font-bold">Generating Reports</h2>
                  <p className="text-purple-100">Download professional PDFs for submission to Indian Railways</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <Card className="border-2 border-blue-200">
              <CardHeader className="bg-blue-50">
                <CardTitle className="text-blue-800 flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Full Bill Report
                </CardTitle>
                <CardDescription>Detailed PDF for each bill</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">Contains complete bill information including:</p>
                <ul className="text-sm space-y-1">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                    Contract & bill details
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                    Work classification breakdown
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                    Detailed PVC calculations
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                    Price indices used
                  </li>
                </ul>
                <div className="pt-3 border-t">
                  <p className="text-xs text-muted-foreground mb-2"><strong>How to access:</strong></p>
                  <p className="text-xs">Go to Bills → Find your bill → Click 'PDF' or 'Download'</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-2 border-green-200">
              <CardHeader className="bg-green-50">
                <CardTitle className="text-green-800 flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Abstract Report
                </CardTitle>
                <CardDescription>Summary across all bills</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">Provides a consolidated view including:</p>
                <ul className="text-sm space-y-1">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                    Contract overview
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                    All bills summary
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                    PVC for each bill
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                    Cumulative totals
                  </li>
                </ul>
                <div className="pt-3 border-t">
                  <p className="text-xs text-muted-foreground mb-2"><strong>How to access:</strong></p>
                  <p className="text-xs">Go to Reports → Abstract → Select contract → Download PDF</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="h-5 w-5 text-blue-600" />
                Downloading Reports - Step by Step
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex gap-4 items-start p-4 bg-gray-50 rounded-lg">
                  <div className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold shrink-0">1</div>
                  <div>
                    <h4 className="font-semibold">For Full Bill Report</h4>
                    <p className="text-sm text-muted-foreground">Navigate to Bills → Find your bill in the list → Click the 'PDF' button (or 'View' then 'Download')</p>
                  </div>
                </div>
                <div className="flex gap-4 items-start p-4 bg-gray-50 rounded-lg">
                  <div className="w-8 h-8 bg-green-500 text-white rounded-full flex items-center justify-center text-sm font-bold shrink-0">2</div>
                  <div>
                    <h4 className="font-semibold">For Abstract Report</h4>
                    <p className="text-sm text-muted-foreground">Navigate to Reports → Abstract → Select your contract from dropdown → Click 'View Abstract' → Click 'Download PDF'</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Link href="/reports/abstract">
            <Button className="w-full gap-2" size="lg">
              <FileText className="h-5 w-5" />
              Go to Bill Abstracts
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </TabsContent>

        {/* Tips Tab */}
        <TabsContent value="tips" className="mt-6 space-y-6">
          <Card className="bg-gradient-to-r from-amber-500 to-orange-500 text-white">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <Lightbulb className="h-8 w-8" />
                <div>
                  <h2 className="text-xl font-bold">Pro Tips & Best Practices</h2>
                  <p className="text-amber-100">Make the most of the IR-PVC System</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FeatureCard
              title="Keep Contract Details Accurate"
              description="Double-check your Agreement Number and Date of Opening. These affect all calculations."
              icon={Building2}
              color="blue"
            />
            <FeatureCard
              title="Match Classification Amounts"
              description="Ensure your classification amounts match your measurement sheets exactly."
              icon={Calculator}
              color="green"
            />
            <FeatureCard
              title="Review Before Saving"
              description="Always review the calculated PVC before saving a bill. Check for any anomalies."
              icon={CheckCircle2}
              color="purple"
            />
            <FeatureCard
              title="Download Reports Promptly"
              description="Download and save your reports after each bill for your records."
              icon={Download}
              color="orange"
            />
            <FeatureCard
              title="Use Search Features"
              description="Use search bars to quickly find contracts and bills by number or name."
              icon={FileText}
              color="blue"
            />
            <FeatureCard
              title="Check Index Availability"
              description="Ensure price indices are available for your billing quarter before creating bills."
              icon={TrendingUp}
              color="green"
            />
          </div>

          {/* Common Mistakes */}
          <Card className="border-2 border-red-200">
            <CardHeader className="bg-red-50">
              <CardTitle className="text-red-800 flex items-center gap-2">
                <AlertCircle className="h-5 w-5" />
                Common Mistakes to Avoid
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-3 items-start">
                <div className="w-6 h-6 bg-red-100 rounded-full flex items-center justify-center shrink-0">
                  <span className="text-red-600 text-xs font-bold">✗</span>
                </div>
                <div>
                  <p className="text-sm font-medium">Wrong Date of Opening</p>
                  <p className="text-xs text-muted-foreground">This changes your base month and affects ALL PVC calculations</p>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <div className="w-6 h-6 bg-red-100 rounded-full flex items-center justify-center shrink-0">
                  <span className="text-red-600 text-xs font-bold">✗</span>
                </div>
                <div>
                  <p className="text-sm font-medium">Missing Sub-Classifications</p>
                  <p className="text-xs text-muted-foreground">Each work type needs proper sub-classification for accurate calculation</p>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <div className="w-6 h-6 bg-red-100 rounded-full flex items-center justify-center shrink-0">
                  <span className="text-red-600 text-xs font-bold">✗</span>
                </div>
                <div>
                  <p className="text-sm font-medium">Incorrect Quarter Selection</p>
                  <p className="text-xs text-muted-foreground">Wrong quarter uses wrong price indices, leading to incorrect PVC</p>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <div className="w-6 h-6 bg-red-100 rounded-full flex items-center justify-center shrink-0">
                  <span className="text-red-600 text-xs font-bold">✗</span>
                </div>
                <div>
                  <p className="text-sm font-medium">Forgetting Non-Scheduled Items</p>
                  <p className="text-xs text-muted-foreground">These items should be excluded from PVC calculation</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Need Help */}
          <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
            <CardContent className="p-6 text-center">
              <HelpCircle className="h-12 w-12 text-green-600 mx-auto mb-3" />
              <h3 className="text-xl font-bold text-gray-900 mb-2">Still Need Help?</h3>
              <p className="text-muted-foreground mb-4">Our Help Center has detailed answers to common questions</p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link href="/help">
                  <Button className="gap-2">
                    <HelpCircle className="h-4 w-4" />
                    Visit Help Center
                  </Button>
                </Link>
                <Link href="/contact">
                  <Button variant="outline" className="gap-2">
                    <Users className="h-4 w-4" />
                    Contact Support
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

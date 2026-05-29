
'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BackButton } from '@/components/ui/back-button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { 
  BookOpen, 
  Search, 
  FileText, 
  Calculator, 
  Building2, 
  TrendingUp,
  Receipt,
  HelpCircle,
  Video,
  Phone,
  Mail,
  MessageCircle,
  ArrowRight,
  Play
} from 'lucide-react';
import Link from 'next/link';

const helpSections = {
  gettingStarted: {
    title: "Getting Started",
    icon: BookOpen,
    faqs: [
      {
        question: "What is the PVC (Price Variation Clause) system?",
        answer: "PVC is a system that adjusts contract payments based on changes in material and labor prices. This ensures fair compensation when market prices change during the contract period. The Indian Railways uses this to maintain fair pricing for contractors when construction costs fluctuate."
      },
      {
        question: "How do I create my first contract?",
        answer: "Step 1: Go to 'Contracts' from the main menu.\nStep 2: Click the 'New Contract' button (green button with '+' icon).\nStep 3: Fill in the contract details like Agreement Number, Contractor Name, and Work Description.\nStep 4: Select the Date of Opening (when the contract started).\nStep 5: Click 'Save' to create the contract.\nThe system will automatically calculate the base month for price calculations."
      },
      {
        question: "What information do I need to create a bill?",
        answer: "To create a bill, you need:\n• The contract it belongs to\n• Bill Number (your reference number)\n• Date of Measurement\n• Quarter (which 3-month period)\n• Work classifications and their amounts\n• Non-scheduled items (if any)\n\nThe system will automatically calculate the PVC amount based on current price indices."
      },
      {
        question: "How do I navigate the system?",
        answer: "The main navigation menu is at the top of every page. For mobile phones, tap the menu icon (three lines) in the top right. The menu is organized into three sections:\n\n1. Operations - for day-to-day work (Contracts, Bills, Reports)\n2. Configuration - for price indices (Admin only)\n3. Administration - for user management (Admin only)\n\nClick on any section to see available options."
      }
    ]
  },
  contracts: {
    title: "Managing Contracts",
    icon: Building2,
    faqs: [
      {
        question: "What is an Agreement Number?",
        answer: "The Agreement Number is the official reference number given to the contract by Indian Railways. It uniquely identifies your contract. Example: 'AGR/2024/001'. You can find this on your contract documents."
      },
      {
        question: "What is the Date of Opening?",
        answer: "This is the date when the contract officially started or when you received the Letter of Acceptance (LOA). This date is very important as it determines the 'base month' - the starting point for all price variation calculations."
      },
      {
        question: "What is the Base Month?",
        answer: "The Base Month is automatically set to one month before your contract's Date of Opening. It serves as the reference point for comparing price changes. All price variations are calculated by comparing current prices to the base month prices."
      },
      {
        question: "How do I view my contract details?",
        answer: "Step 1: Go to 'Contracts' from the main menu.\nStep 2: Find your contract in the list (you can use the search box).\nStep 3: Click on the contract card or the 'View Details' button.\nYou'll see all contract information, associated bills, and can access quarterly averages and extensions."
      },
      {
        question: "Can I edit a contract after creating it?",
        answer: "Yes, you can edit contract details:\nStep 1: Open the contract you want to edit.\nStep 2: Click the 'Edit' button (pencil icon).\nStep 3: Make your changes.\nStep 4: Click 'Save Changes'.\n\nNote: Changing the Date of Opening will affect the base month and all PVC calculations."
      }
    ]
  },
  bills: {
    title: "Creating and Managing Bills",
    icon: Receipt,
    faqs: [
      {
        question: "What is a Running Account Bill?",
        answer: "A Running Account Bill is a regular payment claim submitted during the contract period. It includes the work completed, the amount claimed, and any price variation (PVC) adjustments due to changes in material and labor costs."
      },
      {
        question: "What are Work Classifications?",
        answer: "Work Classifications are categories of work defined by Indian Railways. Common classifications include:\n• Earthwork (moving soil)\n• Cement Concrete (concrete work)\n• Brick Work (masonry)\n• Steel Work (structural steel)\n• Painting\n\nEach classification has its own price indices for PVC calculation."
      },
      {
        question: "What are Sub-Classifications?",
        answer: "Sub-Classifications are more detailed breakdowns within each main classification. For example, under 'Cement Concrete', you might have:\n• M20 Grade Concrete\n• M25 Grade Concrete\n• M30 Grade Concrete\n\nYou can select multiple sub-classifications and enter separate amounts for each in your bill."
      },
      {
        question: "What is the Gross Bill Amount?",
        answer: "The Gross Bill Amount is the total value of work done including all items, before any deductions. It's the full amount you're claiming for the work completed in this billing period."
      },
      {
        question: "What are Non-Scheduled Items?",
        answer: "Non-Scheduled Items are work items that don't qualify for PVC adjustment. These are items with fixed prices that won't change regardless of market conditions. The total of non-scheduled items is deducted from the gross bill amount before calculating PVC."
      },
      {
        question: "How is PVC calculated?",
        answer: "PVC calculation follows these steps:\n1. Take your Gross Bill Amount\n2. Subtract Non-Scheduled Items = Net Bill Amount\n3. For each work classification:\n   - Get current price index\n   - Get base month price index\n   - Calculate variation percentage\n   - Apply to the classification amount\n4. Add up all variations = Total PVC\n5. Add cumulative PVC from previous bills\n\nThe system does all this automatically!"
      },
      {
        question: "How do I create a new bill?",
        answer: "Step 1: Go to 'Bills' from the main menu.\nStep 2: Click 'New Bill' (green button with '+' icon).\nStep 3: Select the contract this bill belongs to.\nStep 4: Enter the Bill Number and Date of Measurement.\nStep 5: Select the quarter (3-month period).\nStep 6: Enter Gross Bill Amount.\nStep 7: Add work classifications:\n   - Select classification type\n   - Select one or more sub-classifications\n   - Enter the amount for each\nStep 8: Add non-scheduled items if any.\nStep 9: Click 'Calculate & Save'.\n\nThe system will automatically calculate the PVC and save your bill."
      }
    ]
  },
  reports: {
    title: "Understanding Reports",
    icon: FileText,
    faqs: [
      {
        question: "What is a Full Bill Report?",
        answer: "A Full Bill Report is a comprehensive PDF document that includes:\n• Contract details\n• Bill information\n• All work classifications with amounts\n• Detailed PVC calculations\n• Price indices used\n• Total amount payable\n\nThis is the official report you can submit to Indian Railways. You can print or download this report from the Bills page."
      },
      {
        question: "What is an Abstract Report?",
        answer: "An Abstract Report is a summary that shows:\n• Contract overview\n• All bills created so far\n• PVC for each bill\n• Cumulative PVC totals\n• Total amount across all bills\n\nThis gives you a quick overview of the entire contract without going into detailed calculations. You can also export this as a PDF."
      },
      {
        question: "How do I download a report?",
        answer: "For a Full Bill Report:\nStep 1: Go to 'Bills'.\nStep 2: Find the bill you want.\nStep 3: Click the 'PDF' or 'Download' button next to the bill.\nStep 4: The PDF will open in a new window - you can print or save it.\n\nFor an Abstract Report:\nStep 1: Go to 'Reports' → 'Abstract'.\nStep 2: Select the contract.\nStep 3: Click 'View Abstract'.\nStep 4: Click the 'Download PDF' button at the top."
      }
    ]
  },
  priceIndices: {
    title: "Price Indices (For Administrators)",
    icon: TrendingUp,
    faqs: [
      {
        question: "What are Price Indices?",
        answer: "Price Indices are numbers that show how prices of materials and labor have changed over time. Indian Railways publishes these indices monthly. They are used to calculate the price variation (PVC) for each classification.\n\nFor example, if the cement price index was 100 in the base month and is 110 now, it means cement prices have increased by 10%."
      },
      {
        question: "Who updates the price indices?",
        answer: "Only administrators can update price indices. Regular users don't need to worry about this - the system will use the indices that have been entered by the admin."
      },
      {
        question: "How often are price indices updated?",
        answer: "Indian Railways typically publishes price indices every month. Administrators should update the system monthly to ensure accurate PVC calculations. The system will show a warning if recent indices are missing."
      },
      {
        question: "Where do price indices come from?",
        answer: "Price indices are officially published by Indian Railways. They are based on market surveys of material costs and labor wages across different regions. Your contract will specify which set of indices to use (e.g., 'GCC-2022 Central Zone')."
      }
    ]
  },
  troubleshooting: {
    title: "Troubleshooting & Common Issues",
    icon: HelpCircle,
    faqs: [
      {
        question: "I can't see the 'New Contract' or 'New Bill' button",
        answer: "This usually means you don't have permission to create new entries. Contact your system administrator to grant you the necessary permissions. They can do this from the 'User Management' section."
      },
      {
        question: "The PVC calculation seems wrong",
        answer: "First, check these things:\n1. Is the Date of Opening correct in your contract?\n2. Are the work classification amounts entered correctly?\n3. Are non-scheduled items properly marked?\n4. Are price indices available for all months?\n\nIf everything looks correct but you still see an issue, contact your administrator. They can check if price indices are properly entered in the system."
      },
      {
        question: "I can't download the PDF report",
        answer: "Try these steps:\n1. Make sure your internet connection is working.\n2. Check if pop-ups are blocked in your browser - allow pop-ups for this site.\n3. Try using a different browser (Chrome or Firefox recommended).\n4. Clear your browser cache and try again.\n5. If the problem persists, contact technical support."
      },
      {
        question: "The page is loading very slowly",
        answer: "Slow loading can happen due to:\n1. Slow internet connection - try moving to a location with better signal.\n2. Many bills or contracts - this is normal, the system is loading all data.\n3. Old device - consider using a newer device or computer.\n4. Browser issues - try closing other tabs and refreshing the page.\n\nFor mobile users: Make sure you have a stable internet connection (Wi-Fi recommended)."
      },
      {
        question: "I forgot my password",
        answer: "Currently, you'll need to contact your system administrator to reset your password. They can update it from the 'User Management' section. In the future, a password reset feature will be added."
      },
      {
        question: "The text is too small to read",
        answer: "You can make text larger in several ways:\n1. On your device: Go to Settings → Display → Font Size and increase it.\n2. In your browser: Press 'Ctrl' and '+' keys together (or 'Cmd' and '+' on Mac) to zoom in.\n3. On mobile: Use pinch-to-zoom gesture (spread two fingers apart on the screen).\n\nThe app is designed to respect your device's text size settings."
      }
    ]
  }
};

export default function HelpCenter() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('gettingStarted');

  // Filter FAQs based on search
  const filteredSections = Object.entries(helpSections).reduce((acc, [key, section]) => {
    if (!searchQuery) {
      (acc as any)[key] = section;
      return acc;
    }

    const filteredFaqs = section.faqs.filter(faq => 
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (filteredFaqs.length > 0) {
      (acc as any)[key] = { ...section, faqs: filteredFaqs };
    }

    return acc;
  }, {} as typeof helpSections);

  return (
    <div className="space-y-6">
      <BackButton href="/dashboard" className="mb-4" />
      {/* Header */}
      <Card className="border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-white">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="bg-blue-100 p-4 rounded-full">
              <HelpCircle className="h-12 w-12 text-blue-600" />
            </div>
          </div>
          <div>
            <CardTitle className="text-3xl sm:text-4xl mb-3">Help & Support Center</CardTitle>
            <CardDescription className="text-base sm:text-lg max-w-2xl mx-auto">
              Welcome! Here you'll find detailed guides and answers to help you use the Railway PVC System effectively. 
              Everything is explained in simple terms with step-by-step instructions.
            </CardDescription>
          </div>
        </CardHeader>
      </Card>

      {/* Getting Started Guide Banner */}
      <Link href="/getting-started">
        <Card className="border-2 border-green-300 bg-gradient-to-r from-green-50 to-emerald-50 hover:shadow-lg transition-shadow cursor-pointer">
          <CardContent className="py-6">
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="bg-green-100 p-4 rounded-full">
                <Play className="h-8 w-8 text-green-600" />
              </div>
              <div className="flex-1 text-center sm:text-left">
                <h3 className="text-xl font-bold text-green-800 mb-1">New to IR-PVC? Start Here!</h3>
                <p className="text-green-700">Complete visual guide with step-by-step instructions for first-time users</p>
              </div>
              <Button className="bg-green-600 hover:bg-green-700 gap-2">
                View Guide
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </Link>

      {/* Tutorial Videos */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="bg-red-100 p-3 rounded-full">
              <Play className="h-6 w-6 text-red-600" />
            </div>
            <div>
              <CardTitle className="text-2xl">Tutorial Videos</CardTitle>
              <CardDescription>Watch step-by-step video guides on how to use the IR-PVC System</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { title: 'IR-PVC Signup Process', desc: 'Create your account step-by-step', id: 'dnGZqdycfoE' },
              { title: 'How to Add a Contract', desc: 'Add and configure contracts', id: 'zx3UbfhG9l4' },
              { title: 'IR-PVC Bill Creation', desc: 'Generate a PVC bill from start to finish', id: 'Xqphs4RHWig' },
            ].map((v) => (
              <a
                key={v.id}
                href={`https://youtu.be/${v.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group block rounded-lg overflow-hidden border-2 border-gray-200 hover:border-red-400 hover:shadow-lg transition-all"
              >
                <div className="relative aspect-video bg-gray-100">
                  <img
                    src={'https://img.youtube.com/vi/' + v.id + '/hqdefault.jpg'}
                    alt={v.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/40 transition">
                    <div className="bg-red-600 group-hover:bg-red-700 rounded-full p-3 shadow-lg">
                      <Play className="h-7 w-7 text-white fill-white" />
                    </div>
                  </div>
                </div>
                <div className="p-3">
                  <h4 className="font-semibold text-gray-900 group-hover:text-red-600 transition">{v.title}</h4>
                  <p className="text-sm text-gray-600 mt-1">{v.desc}</p>
                </div>
              </a>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Search Box */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            <Input
              type="text"
              placeholder="Search for help topics, questions, or keywords..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 text-base h-12"
            />
          </div>
          <p className="text-sm text-gray-600 mt-2">
            💡 Tip: Try searching for terms like "contract", "bill", "PVC", "report", etc.
          </p>
        </CardContent>
      </Card>

      {/* Quick Contact */}
      <Card className="bg-gradient-to-r from-green-50 to-blue-50 border-2">
        <CardHeader>
          <CardTitle className="text-xl flex items-center gap-2">
            <MessageCircle className="h-6 w-6 text-green-600" />
            Need Personal Assistance?
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-start gap-3 p-3 bg-white rounded-lg">
              <Phone className="h-5 w-5 text-green-600 mt-1" />
              <div>
                <div className="font-semibold">Call Support</div>
                <div className="text-sm text-gray-600">Available Mon-Fri, 9 AM - 6 PM</div>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 bg-white rounded-lg">
              <Mail className="h-5 w-5 text-blue-600 mt-1" />
              <div>
                <div className="font-semibold">Email Support</div>
                <div className="text-sm text-gray-600">Response within 24 hours</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Help Sections */}
      <Card>
        <CardContent className="pt-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 h-auto p-2 bg-gray-100">
              {Object.entries(filteredSections).map(([key, section]) => {
                const Icon = section.icon;
                return (
                  <TabsTrigger 
                    key={key} 
                    value={key}
                    className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 py-3 text-xs sm:text-sm data-[state=active]:bg-white data-[state=active]:text-blue-700"
                  >
                    <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                    <span className="text-center">{section.title}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {Object.entries(filteredSections).map(([key, section]) => (
              <TabsContent key={key} value={key} className="mt-6">
                <div className="space-y-4">
                  <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
                    <h3 className="text-xl font-semibold text-blue-900 mb-2">
                      {section.title}
                    </h3>
                    <p className="text-sm text-blue-800">
                      {section.faqs.length} frequently asked question{section.faqs.length !== 1 ? 's' : ''} in this section
                    </p>
                  </div>

                  <Accordion type="single" collapsible className="space-y-3">
                    {section.faqs.map((faq, index) => (
                      <AccordionItem 
                        key={index} 
                        value={`${key}-${index}`}
                        className="border-2 rounded-lg px-4 bg-white hover:shadow-md transition-shadow"
                      >
                        <AccordionTrigger className="text-left text-base sm:text-lg font-medium hover:no-underline py-4">
                          <div className="flex gap-3 items-start">
                            <HelpCircle className="h-5 w-5 text-blue-600 mt-1 flex-shrink-0" />
                            <span className="pr-4">{faq.question}</span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="text-base text-gray-700 pb-4 pl-8">
                          <div className="whitespace-pre-line leading-relaxed">
                            {faq.answer}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      {/* No Results */}
      {searchQuery && Object.keys(filteredSections).length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Search className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No results found</h3>
            <p className="text-gray-600">
              We couldn't find any help topics matching "{searchQuery}". 
              Try different keywords or contact support for assistance.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

import { Metadata } from "next";
import { LabourIndexUpload } from "@/components/labour-index-upload";
import { ComponentIndexManager } from "@/components/component-index-manager";

export const metadata: Metadata = {
  title: "Labour Index Documents",
  description: "Upload and manage labour component index documents for bill PDF reports",
};

export default async function ComponentDocumentsPage() {
  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Component Index Documents
        </h1>
        <p className="text-gray-600">
          Upload and manage component index documents (Labour, Cement, Steel, etc.) that will be
          automatically included in bill PDF reports based on the component type and applicable months.
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <h3 className="text-sm font-semibold text-blue-900 mb-2">
          How it works:
        </h3>
        <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
          <li>Upload PDF documents for different component types (Labour, Cement, TMT Bars, etc.)</li>
          <li>Select multiple months that the document applies to</li>
          <li>Mark documents as Provisional or Final for version control</li>
          <li>Documents are automatically included in bill PDF reports when the bill contains the selected component</li>
          <li>Each component can have multiple documents for different time periods</li>
          <li>You can filter, sort, and manage uploaded documents with full CRUD operations</li>
        </ul>
      </div>

      <div className="space-y-6">
        <LabourIndexUpload showDocumentsList={false} />
        <ComponentIndexManager />
      </div>
    </div>
  );
}

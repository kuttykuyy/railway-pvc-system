import { Suspense } from 'react';
import { SignUpForm } from './signup-form';

export default function SignUpPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="w-full max-w-md mx-auto text-center">
          <div className="animate-pulse h-8 w-48 bg-gray-200 rounded mx-auto mb-4" />
          <div className="animate-pulse h-4 w-32 bg-gray-200 rounded mx-auto" />
        </div>
      </div>
    }>
      <SignUpForm />
    </Suspense>
  );
}

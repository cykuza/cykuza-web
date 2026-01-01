'use client';

import React from 'react';

interface ErrorBoundaryState {
 hasError: boolean;
 error?: Error;
}

interface ErrorBoundaryProps {
 children: React.ReactNode;
 fallback?: React.ReactNode;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
 constructor(props: ErrorBoundaryProps) {
  super(props);
  this.state = { hasError: false };
 }

 static getDerivedStateFromError(error: Error): ErrorBoundaryState {
  return { hasError: true, error };
 }

 componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
  // Only log in development to prevent information leakage
  if (process.env.NODE_ENV === 'development') {
   console.error('Error caught by boundary:', error, errorInfo);
  }
 }

 render() {
  if (this.state.hasError) {
   if (this.props.fallback) {
    return this.props.fallback;
   }

   return (
    <div className="min-h-screen flex items-center justify-center bg-black">
     <div className="text-center p-8 bg-gray-900 rounded-lg max-w-md">
      <h2 className="text-2xl font-bold mb-4 text-white">Something went wrong</h2>
      <p className="text-gray-400 mb-4">
       An unexpected error occurred. Please try refreshing the page.
      </p>
      <button
       onClick={() => {
        this.setState({ hasError: false, error: undefined });
        window.location.reload();
       }}
       className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700"
      >
       Reload Page
      </button>
     </div>
    </div>
   );
  }

  return this.props.children;
 }
}
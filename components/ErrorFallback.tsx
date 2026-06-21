'use client';
import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorFallback extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className='flex items-center justify-center p-8 bg-white min-h-[400px]'>
          <div className='text-center p-8 bg-slate-50 rounded-xl shadow-sm border border-slate-100 max-w-md w-full'>
            <h2 className='text-xl font-bold text-slate-800 mb-4'>組件發生錯誤</h2>
            <p className='text-slate-600 mb-6 text-sm overflow-hidden text-ellipsis whitespace-nowrap'>{this.state.error?.message || '發生未預期的錯誤'}</p>
            <button
              onClick={() => this.setState({ hasError: false, error: undefined })}
              className='px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium'
            >
              重新嘗試
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

import React from "react";

interface State {
  hasError: boolean;
}

export class ExamErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
        <div className="bg-white border-2 border-amber-300 rounded-2xl p-8 max-w-md w-full text-center shadow-xl">
          <p className="text-amber-700 font-black text-xs uppercase tracking-[0.2em] mb-3">
            Page Error
          </p>
          <p className="text-stone-700 font-medium text-sm mb-2">
            Your answers are saved. Reload to continue your exam.
          </p>
          <p className="text-stone-400 text-[10px] uppercase tracking-widest font-bold mb-8">
            Do not close this tab
          </p>
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-brand-800 hover:bg-brand-900 text-white font-black uppercase tracking-[0.2em] text-xs h-12 rounded-xl transition-colors"
          >
            Reload &amp; Continue
          </button>
        </div>
      </div>
    );
  }
}

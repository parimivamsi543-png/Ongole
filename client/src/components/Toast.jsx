import React from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

export const ToastContainer = ({ toasts, removeToast }) => {
  if (!toasts.length) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-md w-full pointer-events-none px-4 sm:px-0">
      {toasts.map((t) => {
        const styles =
          t.type === 'success'
            ? 'bg-emerald-950/90 border-brand-500/50 text-emerald-100 shadow-glow-emerald'
            : t.type === 'error'
            ? 'bg-rose-950/90 border-rose-500/50 text-rose-100'
            : 'bg-navy-900/95 border-accent-cyan/50 text-cyan-100 shadow-glow-cyan';

        const Icon =
          t.type === 'success' ? CheckCircle2 : t.type === 'error' ? AlertTriangle : Info;

        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl border backdrop-blur-xl shadow-2xl animate-in fade-in slide-in-from-right-4 duration-200 ${styles}`}
          >
            <Icon className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              {t.title && <p className="text-sm font-bold">{t.title}</p>}
              <p className="text-xs opacity-90 leading-relaxed break-words">{t.message}</p>
            </div>
            <button
              onClick={() => removeToast(t.id)}
              className="text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};

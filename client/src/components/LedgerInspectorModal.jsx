import React, { useEffect, useState } from 'react';
import { X, Scale, Link2, CheckCircle2, XCircle, ShieldCheck } from 'lucide-react';
import { api } from '../services/api';

export const LedgerInspectorModal = ({ transactionId, onClose }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!transactionId) return;
    setLoading(true);
    setError(null);
    api.transactions
      .getById(transactionId)
      .then((res) => setData(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [transactionId]);

  if (!transactionId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="glass-card w-full max-w-3xl max-h-[90vh] overflow-y-auto border-slate-700/80">
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-navy-900/95 backdrop-blur-xl">
          <div className="flex items-center gap-2.5">
            <Scale className="w-5 h-5 text-brand-400" />
            <div>
              <h3 className="font-bold text-white text-base">Double-Entry Journal Inspector</h3>
              <p className="text-[11px] font-mono text-slate-400">{transactionId}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {loading ? (
            <div className="py-12 text-center text-slate-400 text-sm">Loading cryptographic ledger entries...</div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">{error}</div>
          ) : data ? (
            <>
              {/* Transaction Summary Header */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-navy-950/80 border border-slate-800">
                  <p className="text-[11px] text-slate-400 uppercase tracking-wider">Type</p>
                  <p className="text-sm font-bold text-white mt-0.5">{data.transaction.type}</p>
                </div>
                <div className="p-3.5 rounded-xl bg-navy-950/80 border border-slate-800">
                  <p className="text-[11px] text-slate-400 uppercase tracking-wider">Amount</p>
                  <p className="text-sm font-bold font-mono text-brand-300 mt-0.5">
                    ${data.transaction.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-navy-950/80 border border-slate-800">
                  <p className="text-[11px] text-slate-400 uppercase tracking-wider">Status</p>
                  <p className="mt-0.5">
                    {data.transaction.status === 'POSTED' ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-brand-400">
                        <CheckCircle2 className="w-3.5 h-3.5" /> POSTED
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-400">
                        <XCircle className="w-3.5 h-3.5" /> {data.transaction.status}
                      </span>
                    )}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-navy-950/80 border border-slate-800">
                  <p className="text-[11px] text-slate-400 uppercase tracking-wider">Actor</p>
                  <p className="text-xs font-semibold text-slate-200 truncate mt-0.5">
                    {data.transaction.actorId?.email || 'System'}
                  </p>
                </div>
              </div>

              {data.transaction.failureReason && (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs leading-relaxed">
                  <span className="font-bold uppercase tracking-wider block mb-1 text-rose-400">Refusal Reason</span>
                  {data.transaction.failureReason}
                </div>
              )}

              {/* Balanced Ledger Entries */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <Link2 className="w-4 h-4 text-accent-cyan" />
                    Immutable Double-Entry Postings ({data.ledgerEntries.length})
                  </h4>
                  {data.isBalanced && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-brand-500/15 text-brand-300 border border-brand-500/40">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      DEBITS == CREDITS VERIFIED
                    </span>
                  )}
                </div>

                {data.ledgerEntries.length === 0 ? (
                  <p className="text-xs text-slate-400 italic p-4 rounded-xl bg-navy-950/60 border border-slate-800">
                    No ledger entries posted (transaction was refused prior to settlement).
                  </p>
                ) : (
                  <div className="space-y-3">
                    {data.ledgerEntries.map((entry) => (
                      <div
                        key={entry.entryId}
                        className="p-4 rounded-xl bg-navy-950/90 border border-slate-800 space-y-2.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 text-[11px] font-mono">
                              SEQ #{entry.sequenceNumber}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-md text-[11px] font-bold tracking-wider ${
                                entry.entryType === 'DEBIT'
                                  ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                                  : 'bg-brand-500/15 text-brand-300 border border-brand-500/30'
                              }`}
                            >
                              {entry.entryType}
                            </span>
                            <span className="text-xs font-mono text-slate-400">
                              Entry ID: {entry.entryId.slice(0, 12)}...
                            </span>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold font-mono text-white">
                              ${entry.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </p>
                            <p className="text-[11px] font-mono text-slate-400">
                              Balance After: ${entry.balanceAfter.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </p>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-800/80 grid grid-cols-1 gap-1 text-[11px] font-mono">
                          <div className="flex items-center gap-2 text-slate-400">
                            <span className="text-slate-500 w-24 shrink-0">Prev Hash:</span>
                            <span className="truncate text-slate-300">{entry.previousHash}</span>
                          </div>
                          <div className="flex items-center gap-2 text-accent-cyan">
                            <span className="text-slate-500 w-24 shrink-0">SHA-256 Hash:</span>
                            <span className="truncate">{entry.hash}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeftRight, CheckCircle2, XCircle, Eye, Filter, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { formatINR } from '../utils/formatCurrency';

export const TransactionsPage = ({ onOpenTransaction, onInspectTransaction, refreshTrigger, addToast }) => {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const canTransact = user?.role === 'ADMIN' || user?.role === 'ACCOUNT_HOLDER';

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: 100 };
      if (typeFilter) params.type = typeFilter;
      if (statusFilter) params.status = statusFilter;

      const { data } = await api.transactions.list(params);
      setTransactions(data.transactions || []);
    } catch (err) {
      addToast('error', 'Failed to load transactions', err.message);
    } finally {
      setLoading(false);
    }
  }, [typeFilter, statusFilter, addToast]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions, refreshTrigger]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-white">Double-Entry Transaction Ledger</h2>
          <p className="text-sm text-slate-400 mt-1">
            Append-only history of every posted transaction and refused attempt. Select any row to verify balanced entries.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button onClick={loadTransactions} className="btn-secondary">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {canTransact && (
            <button onClick={() => onOpenTransaction('TRANSFER')} className="btn-primary">
              <ArrowLeftRight className="w-4 h-4" />
              New Transaction
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="glass-card p-4 flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400 mr-2">
          <Filter className="w-3.5 h-3.5 text-brand-400" /> Filters:
        </span>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="input-field w-auto py-1.5 text-xs"
        >
          <option value="">All Types</option>
          <option value="DEPOSIT">DEPOSIT</option>
          <option value="WITHDRAWAL">WITHDRAWAL</option>
          <option value="TRANSFER">TRANSFER</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input-field w-auto py-1.5 text-xs"
        >
          <option value="">All Statuses</option>
          <option value="POSTED">POSTED</option>
          <option value="REJECTED">REJECTED</option>
          <option value="FAILED">FAILED</option>
        </select>

        <span className="ml-auto text-xs font-mono text-slate-400">
          Showing {transactions.length} records
        </span>
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-navy-950/70 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <th className="py-3.5 px-5">TX ID / Time</th>
                <th className="py-3.5 px-4">Type</th>
                <th className="py-3.5 px-4">Source (Debit) → Dest (Credit)</th>
                <th className="py-3.5 px-4">Amount</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Actor</th>
                <th className="py-3.5 px-5 text-right">Journal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-sm">
              {transactions.map((tx) => (
                <tr
                  key={tx.transactionId}
                  onClick={() => onInspectTransaction(tx.transactionId)}
                  className="hover:bg-slate-800/45 cursor-pointer transition-colors"
                >
                  <td className="py-3.5 px-5">
                    <p className="font-mono text-xs text-slate-200">{tx.transactionId.slice(0, 12)}...</p>
                    <p className="text-[11px] text-slate-500">{new Date(tx.createdAt).toLocaleString()}</p>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-xs font-bold text-slate-200">
                      {tx.type}
                    </span>
                  </td>
                  <td className="py-3.5 px-4">
                    <p className="font-mono text-xs text-slate-300">
                      {tx.sourceAccountId?.accountNumber || 'SYS-CLEARING'} → {tx.destinationAccountId?.accountNumber || 'SYS-CLEARING'}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate max-w-xs">
                      {tx.failureReason ? (
                        <span className="text-rose-400">{tx.failureReason}</span>
                      ) : (
                        tx.description
                      )}
                    </p>
                  </td>
                  <td className="py-3.5 px-4 font-mono font-bold text-white">
                    {formatINR(tx.amount)}
                  </td>
                  <td className="py-3.5 px-4">
                    {tx.status === 'POSTED' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-brand-500/15 text-brand-300 border border-brand-500/30">
                        <CheckCircle2 className="w-3 h-3" /> POSTED
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30">
                        <XCircle className="w-3 h-3" /> {tx.status}
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-4">
                    <p className="text-xs text-slate-300">{tx.actorId?.fullName || 'System'}</p>
                    <p className="text-[10px] font-mono text-slate-500">{tx.actorId?.role}</p>
                  </td>
                  <td className="py-3.5 px-5 text-right">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-accent-cyan/15 text-cyan-300 border border-accent-cyan/30 text-xs font-semibold hover:bg-accent-cyan/25"
                    >
                      <Eye className="w-3.5 h-3.5" /> Inspect
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && transactions.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500 text-sm">
                    No matching transactions found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};


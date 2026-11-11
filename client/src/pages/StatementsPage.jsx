import React, { useState, useEffect, useCallback } from 'react';
import {
  FileSpreadsheet,
  Download,
  Printer,
  CheckCircle2,
  XCircle,
  UserCheck,
  Calendar,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';

export const StatementsPage = ({ selectedAccountId, setSelectedAccountId, addToast }) => {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [statement, setStatement] = useState(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(false);

  const isPrivileged = user?.role === 'ADMIN' || user?.role === 'AUDITOR';

  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const res = isPrivileged ? await api.accounts.getAll() : await api.accounts.getMy();
        const accs = res.data.accounts || [];
        setAccounts(accs);
        if (!selectedAccountId && accs.length > 0) {
          const preferred = accs.find((a) => !a.isSystem) || accs[0];
          setSelectedAccountId(preferred._id);
        }
      } catch (err) {
        addToast('error', 'Failed to load accounts', err.message);
      }
    };
    fetchAccounts();
  }, [isPrivileged, selectedAccountId, setSelectedAccountId, addToast]);

  const loadStatement = useCallback(async () => {
    if (!selectedAccountId) return;
    setLoading(true);
    try {
      const params = {};
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      const { data } = await api.statements.getAccountStatement(selectedAccountId, params);
      setStatement(data.statement);
    } catch (err) {
      addToast('error', 'Statement Error', err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedAccountId, startDate, endDate, addToast]);

  useEffect(() => {
    loadStatement();
  }, [loadStatement]);

  const exportCSV = () => {
    if (!statement) return;
    const headers = [
      'Timestamp',
      'TransactionID',
      'Type',
      'Status',
      'Direction',
      'Amount',
      'RunningBalance',
      'ActorName',
      'ActorEmail',
      'ActorRole',
      'Description',
      'FailureReason',
    ];
    const rows = statement.items.map((i) => [
      new Date(i.date).toISOString(),
      i.transactionId,
      i.type,
      i.status,
      i.direction,
      i.amount.toFixed(2),
      i.runningBalance.toFixed(2),
      `"${(i.actor?.name || '').replace(/"/g, '""')}"`,
      i.actor?.email || '',
      i.actor?.role || '',
      `"${(i.description || '').replace(/"/g, '""')}"`,
      `"${(i.failureReason || '').replace(/"/g, '""')}"`,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `statement-${statement.account.accountNumber}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportJSON = () => {
    if (!statement) return;
    const blob = new Blob([JSON.stringify(statement, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `statement-${statement.account.accountNumber}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="no-print flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-white">Official Account Statements</h2>
          <p className="text-sm text-slate-400 mt-1">
            Auditable ledger statements capturing posted entries, refused attempts, running balances, and actor attribution.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button onClick={exportCSV} disabled={!statement} className="btn-secondary text-xs">
            <Download className="w-3.5 h-3.5 text-brand-400" />
            Export CSV
          </button>
          <button onClick={exportJSON} disabled={!statement} className="btn-secondary text-xs">
            <Download className="w-3.5 h-3.5 text-accent-cyan" />
            Export JSON
          </button>
          <button onClick={() => window.print()} disabled={!statement} className="btn-primary text-xs">
            <Printer className="w-3.5 h-3.5" />
            Print Statement
          </button>
        </div>
      </div>

      {/* Selector Bar */}
      <div className="no-print glass-card p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
            Select Account
          </label>
          <select
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
            className="input-field"
          >
            {accounts.map((acc) => (
              <option key={acc._id} value={acc._id}>
                {acc.accountNumber} — {acc.name} (${acc.balance.toFixed(2)})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
            From Date
          </label>
          <div className="relative">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="input-field"
            />
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
            To Date
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="input-field"
          />
        </div>
      </div>

      {loading ? (
        <div className="glass-card p-12 text-center text-slate-400">Reconstructing statement from immutable ledger...</div>
      ) : statement ? (
        <div className="space-y-6">
          {/* Statement Summary Header Card */}
          <div className="glass-card p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-brand-500/15 border border-brand-500/30 flex items-center justify-center text-brand-400">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">{statement.account.name}</h3>
                  <p className="text-xs font-mono text-slate-400">
                    {statement.account.accountNumber} · {statement.account.type} · {statement.account.currency}
                    {statement.account.owner ? ` · Owner: ${statement.account.owner.fullName}` : ''}
                  </p>
                </div>
              </div>
              <div className="text-left sm:text-right">
                <p className="text-[11px] uppercase tracking-wider text-slate-400">Current Settled Balance</p>
                <p className="text-3xl font-extrabold tabular-nums-mono text-brand-300">
                  ${statement.summary.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-3.5 rounded-xl bg-navy-950/70 border border-slate-800">
                <p className="text-[11px] text-slate-400 uppercase tracking-wider">Total Inflows</p>
                <p className="text-lg font-bold font-mono text-brand-400 mt-1">
                  +${statement.summary.totalInflow.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="p-3.5 rounded-xl bg-navy-950/70 border border-slate-800">
                <p className="text-[11px] text-slate-400 uppercase tracking-wider">Total Outflows</p>
                <p className="text-lg font-bold font-mono text-amber-300 mt-1">
                  -${statement.summary.totalOutflow.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="p-3.5 rounded-xl bg-navy-950/70 border border-slate-800">
                <p className="text-[11px] text-slate-400 uppercase tracking-wider">Posted Transactions</p>
                <p className="text-lg font-bold font-mono text-white mt-1">
                  {statement.summary.successfulTransactions}
                </p>
              </div>
              <div className="p-3.5 rounded-xl bg-navy-950/70 border border-slate-800">
                <p className="text-[11px] text-slate-400 uppercase tracking-wider">Refused / Failed Attempts</p>
                <p className="text-lg font-bold font-mono text-rose-400 mt-1">
                  {statement.summary.refusedAttempts}
                </p>
              </div>
            </div>
          </div>

          {/* Statement Line Items */}
          <div className="glass-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-navy-950/70 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    <th className="py-3.5 px-5">Timestamp</th>
                    <th className="py-3.5 px-4">Type & Status</th>
                    <th className="py-3.5 px-4">Details & Counterparty</th>
                    <th className="py-3.5 px-4">Actor Responsible</th>
                    <th className="py-3.5 px-4 text-right">Amount</th>
                    <th className="py-3.5 px-5 text-right">Running Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-sm">
                  {statement.items.map((item) => {
                    const isRefused = item.status !== 'POSTED';
                    const isCredit = item.direction.includes('CREDIT');

                    return (
                      <tr key={item.transactionId} className={isRefused ? 'bg-rose-950/15' : 'hover:bg-slate-800/30'}>
                        <td className="py-3.5 px-5 font-mono text-xs text-slate-300 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-slate-500" />
                            {new Date(item.date).toLocaleString()}
                          </div>
                          <span className="text-[10px] text-slate-500">{item.transactionId.slice(0, 10)}...</span>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="space-y-1">
                            <span className="block text-xs font-bold text-white">{item.type}</span>
                            {isRefused ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                                <XCircle className="w-3 h-3" /> {item.status}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand-500/15 text-brand-300 border border-brand-500/30">
                                <CheckCircle2 className="w-3 h-3" /> POSTED
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 max-w-xs">
                          <p className="text-xs font-mono text-slate-300">
                            {item.sourceAccount} → {item.destinationAccount}
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5">{item.description}</p>
                          {item.failureReason && (
                            <p className="text-[11px] text-rose-400 font-medium mt-1 leading-snug">
                              Refused: {item.failureReason}
                            </p>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-1.5 text-xs text-slate-200 font-medium">
                            <UserCheck className="w-3.5 h-3.5 text-accent-cyan shrink-0" />
                            {item.actor?.name}
                          </div>
                          <p className="text-[11px] font-mono text-slate-400">
                            {item.actor?.email} ({item.actor?.role})
                          </p>
                        </td>
                        <td
                          className={`py-3.5 px-4 text-right font-mono font-bold whitespace-nowrap ${
                            isRefused ? 'text-rose-400 line-through' : isCredit ? 'text-brand-400' : 'text-amber-300'
                          }`}
                        >
                          {isRefused ? '' : isCredit ? '+' : '-'}${item.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3.5 px-5 text-right font-mono font-bold text-white whitespace-nowrap">
                          ${item.runningBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    );
                  })}
                  {statement.items.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-slate-500 text-sm">
                        No transactions or attempts recorded for this period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Link2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ScrollText,
} from 'lucide-react';
import { api } from '../services/api';
import { formatINR } from '../utils/formatCurrency';

export const AuditLogsPage = ({ addToast }) => {
  const [subTab, setSubTab] = useState('LOGS'); // 'LOGS' | 'CHAIN'
  const [logs, setLogs] = useState([]);
  const [entries, setEntries] = useState([]);
  const [integrity, setIntegrity] = useState(null);
  const [outcomeFilter, setOutcomeFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);

  const loadAuditData = useCallback(async () => {
    setLoading(true);
    try {
      const [logsRes, chainRes, intRes] = await Promise.all([
        api.audit.getLogs({ limit: 80, ...(outcomeFilter ? { outcome: outcomeFilter } : {}) }),
        api.audit.getLedgerEntries({ limit: 60 }),
        api.audit.getIntegrity(),
      ]);
      setLogs(logsRes.data.logs || []);
      setEntries(chainRes.data.entries || []);
      setIntegrity(intRes.data.integrity);
    } catch (err) {
      addToast('error', 'Audit Load Failed', err.message);
    } finally {
      setLoading(false);
    }
  }, [outcomeFilter, addToast]);

  useEffect(() => {
    loadAuditData();
  }, [loadAuditData]);

  const handleRunIntegrityAudit = async () => {
    setVerifying(true);
    try {
      const [intRes, logsRes] = await Promise.all([
        api.audit.getIntegrity(),
        api.audit.getLogs({ limit: 80, ...(outcomeFilter ? { outcome: outcomeFilter } : {}) }),
      ]);
      const data = intRes.data;
      setIntegrity(data.integrity);
      setLogs(logsRes.data.logs || []);
      if (data.integrity.isMathematicallySound) {
        addToast(
          'success',
          'Cryptographic Integrity Verified',
          `${data.integrity.totalLedgerEntries} entries verified. Debits == Credits (${formatINR(data.integrity.totalDebits)}).`
        );
      } else {
        addToast('error', 'INTEGRITY VIOLATION DETECTED', `${data.integrity.discrepancies.length} discrepancy(s) found!`);
      }
    } catch (err) {
      addToast('error', 'Verification Error', err.message);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-white">Audit Trail & Cryptographic Proof</h2>
          <p className="text-sm text-slate-400 mt-1">
            Immutable security log of all accepted and refused actions plus SHA-256 hash-chain verification.
          </p>
        </div>
        <button onClick={handleRunIntegrityAudit} disabled={verifying} className="btn-primary">
          <RefreshCw className={`w-4 h-4 ${verifying ? 'animate-spin' : ''}`} />
          {verifying ? 'Auditing Chain...' : 'Run Cryptographic Audit'}
        </button>
      </div>

      {/* Integrity Proof Card */}
      {integrity && (
        <div
          className={`glass-card p-6 border ${
            integrity.isMathematicallySound
              ? 'border-brand-500/40 bg-emerald-950/15'
              : 'border-rose-500/50 bg-rose-950/20'
          }`}
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                  integrity.isMathematicallySound
                    ? 'bg-brand-500/20 text-brand-400 border border-brand-500/40'
                    : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                }`}
              >
                {integrity.isMathematicallySound ? <ShieldCheck className="w-6 h-6" /> : <ShieldAlert className="w-6 h-6" />}
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-white">
                  {integrity.isMathematicallySound
                    ? 'MATHEMATICAL & CRYPTOGRAPHIC INVARIANTS: VERIFIED'
                    : 'ALERT: LEDGER INTEGRITY VIOLATION DETECTED'}
                </h3>
                <p className="text-xs text-slate-300 mt-0.5 font-mono">
                  Audited {integrity.totalLedgerEntries} ledger postings across {integrity.totalTransactions} transactions at{' '}
                  {new Date(integrity.timestamp).toLocaleTimeString()}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="px-3 py-2 rounded-xl bg-navy-950/80 border border-slate-800">
                <p className="text-[10px] uppercase tracking-wider text-slate-400">SHA-256 Chain</p>
                <p className={`text-xs font-bold mt-0.5 ${integrity.isHashChainIntact ? 'text-brand-400' : 'text-rose-400'}`}>
                  {integrity.isHashChainIntact ? 'INTACT' : 'BROKEN'}
                </p>
              </div>
              <div className="px-3 py-2 rounded-xl bg-navy-950/80 border border-slate-800">
                <p className="text-[10px] uppercase tracking-wider text-slate-400">Debits == Credits</p>
                <p className={`text-xs font-bold mt-0.5 ${integrity.isDoubleEntryBalanced ? 'text-brand-400' : 'text-rose-400'}`}>
                  {formatINR(integrity.totalDebits)}
                </p>
              </div>
              <div className="px-3 py-2 rounded-xl bg-navy-950/80 border border-slate-800">
                <p className="text-[10px] uppercase tracking-wider text-slate-400">Reconciled</p>
                <p className={`text-xs font-bold mt-0.5 ${integrity.isAccountBalanceReconciled ? 'text-brand-400' : 'text-rose-400'}`}>
                  {integrity.isAccountBalanceReconciled ? '100% MATCH' : 'DESYNC'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sub-navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="inline-flex p-1 rounded-xl bg-navy-900 border border-slate-800">
          <button
            onClick={() => setSubTab('LOGS')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              subTab === 'LOGS' ? 'bg-brand-500 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <ScrollText className="w-3.5 h-3.5" />
            Security Audit Events ({logs.length})
          </button>
          <button
            onClick={() => setSubTab('CHAIN')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              subTab === 'CHAIN' ? 'bg-accent-cyan text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Link2 className="w-3.5 h-3.5" />
            SHA-256 Hash Chain ({entries.length})
          </button>
        </div>

        {subTab === 'LOGS' && (
          <select
            value={outcomeFilter}
            onChange={(e) => setOutcomeFilter(e.target.value)}
            className="input-field w-auto py-1.5 text-xs"
          >
            <option value="">All Outcomes</option>
            <option value="SUCCESS">SUCCESS</option>
            <option value="REFUSED">REFUSED</option>
            <option value="BLOCKED">BLOCKED</option>
            <option value="FAILED">FAILED</option>
          </select>
        )}
      </div>

      {/* Content View */}
      {loading ? (
        <div className="glass-card p-10 text-center text-slate-400">Loading audit telemetry...</div>
      ) : subTab === 'LOGS' ? (
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-navy-950/70 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="py-3.5 px-5">Timestamp</th>
                  <th className="py-3.5 px-4">Outcome</th>
                  <th className="py-3.5 px-4">Action</th>
                  <th className="py-3.5 px-4">Actor & Role</th>
                  <th className="py-3.5 px-5">Reason / Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs">
                {logs.map((log) => {
                  const isAlert = log.outcome !== 'SUCCESS';
                  return (
                    <tr key={log._id} className={isAlert ? 'bg-rose-950/15' : 'hover:bg-slate-800/30'}>
                      <td className="py-3 px-5 font-mono text-slate-400 whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="py-3 px-4">
                        {log.outcome === 'SUCCESS' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand-500/15 text-brand-300 border border-brand-500/30">
                            <CheckCircle2 className="w-3 h-3" /> SUCCESS
                          </span>
                        ) : log.outcome === 'BLOCKED' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                            <AlertTriangle className="w-3 h-3" /> BLOCKED
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30">
                            <XCircle className="w-3 h-3" /> {log.outcome}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold text-slate-200">{log.action}</td>
                      <td className="py-3 px-4">
                        <p className="text-slate-200 font-medium">{log.actorEmail}</p>
                        <p className="text-[10px] font-mono text-slate-500">{log.actorRole}</p>
                      </td>
                      <td className="py-3 px-5 text-slate-300 max-w-md">
                        {log.reason || (log.details ? JSON.stringify(log.details) : '—')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <div key={entry.entryId} className="glass-card p-4 space-y-2 border-slate-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="px-2.5 py-0.5 rounded-md bg-slate-800 border border-slate-700 font-mono text-xs font-bold text-white">
                    SEQ #{entry.sequenceNumber}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                      entry.entryType === 'DEBIT'
                        ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                        : 'bg-brand-500/15 text-brand-300 border border-brand-500/30'
                    }`}
                  >
                    {entry.entryType}
                  </span>
                  <span className="text-xs font-mono text-slate-300">
                    {entry.accountId?.accountNumber} ({entry.accountId?.name})
                  </span>
                </div>
                <div className="text-right font-mono">
                  <span className="text-sm font-bold text-white">{formatINR(entry.amount)}</span>
                  <span className="text-xs text-slate-400 ml-3">Bal After: {formatINR(entry.balanceAfter)}</span>
                </div>
              </div>
              <div className="pt-2 border-t border-slate-800/80 grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] font-mono">
                <div className="truncate text-slate-400">
                  <span className="text-slate-500">Prev: </span>
                  {entry.previousHash}
                </div>
                <div className="truncate text-accent-cyan">
                  <span className="text-slate-500">Hash: </span>
                  {entry.hash}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};


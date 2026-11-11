import React, { useState, useEffect, useCallback } from 'react';
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  ShieldCheck,
  AlertTriangle,
  Activity,
  FileSpreadsheet,
  Zap,
  RefreshCw,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { RoleBadge } from '../components/RoleBadge';
import { formatINR } from '../utils/formatCurrency';

export const DashboardPage = ({
  onOpenTransaction,
  onInspectTransaction,
  onNavigate,
  onSelectStatementAccount,
  refreshTrigger,
  addToast,
}) => {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [integrity, setIntegrity] = useState(null);
  const [loading, setLoading] = useState(true);

  const isPrivileged = user?.role === 'ADMIN' || user?.role === 'AUDITOR';
  const canTransact = user?.role === 'ADMIN' || user?.role === 'ACCOUNT_HOLDER';

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const requests = [
        isPrivileged ? api.accounts.getAll() : api.accounts.getMy(),
        api.transactions.list({ limit: 8 }),
      ];
      if (isPrivileged) {
        requests.push(api.audit.getIntegrity());
      }

      const [accRes, txRes, intRes] = await Promise.all(requests);
      setAccounts(accRes.data.accounts || []);
      setTransactions(txRes.data.transactions || []);
      if (intRes) {
        setIntegrity(intRes.data.integrity);
      }
    } catch (err) {
      addToast('error', 'Failed to load dashboard', err.message);
    } finally {
      setLoading(false);
    }
  }, [isPrivileged, addToast]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard, refreshTrigger]);

  const customerAccounts = accounts.filter((a) => !a.isSystem);
  const systemClearing = accounts.find((a) => a.accountNumber === 'SYS-CLEARING-001');
  const totalCustomerLiquidity = customerAccounts.reduce((sum, a) => sum + (a.balance || 0), 0);
  const refusedCount = transactions.filter((t) => t.status === 'REJECTED' || t.status === 'FAILED').length;

  return (
    <div className="space-y-6">
      {/* Top Executive Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              {isPrivileged ? 'System Treasury & Oversight' : `Welcome back, ${user?.fullName?.split(' ')[0]}`}
            </h2>
            <RoleBadge role={user?.role} compact />
          </div>
          <p className="text-sm text-slate-400 mt-1">
            {isPrivileged
              ? 'Real-time double-entry balance conservation, cryptographic audit proofs & account controls.'
              : 'Manage your authorized accounts, execute atomic transfers, and verify ledger statements.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button onClick={fetchDashboard} className="btn-secondary">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {canTransact && (
            <>
              <button onClick={() => onOpenTransaction('DEPOSIT')} className="btn-primary">
                <ArrowDownLeft className="w-4 h-4" />
                Deposit
              </button>
              <button onClick={() => onOpenTransaction('TRANSFER')} className="btn-secondary border-accent-cyan/40 text-cyan-300">
                <ArrowLeftRight className="w-4 h-4" />
                Transfer
              </button>
            </>
          )}
        </div>
      </div>

      {/* KPI Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="glass-card-hover p-5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {isPrivileged ? 'Total Customer Deposits' : 'Total Available Balance'}
            </span>
            <div className="w-9 h-9 rounded-xl bg-brand-500/15 border border-brand-500/30 flex items-center justify-center text-brand-400">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <p className="text-3xl font-extrabold tabular-nums-mono text-white mt-3">
            {formatINR(totalCustomerLiquidity)}
          </p>
          <p className="text-xs text-brand-400 mt-2 font-mono">
            Across {customerAccounts.length} active ledger account{customerAccounts.length === 1 ? '' : 's'}
          </p>
        </div>

        <div className="glass-card-hover p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {isPrivileged ? 'System Clearing Offset' : 'Ledger Integrity'}
            </span>
            <div className="w-9 h-9 rounded-xl bg-accent-cyan/15 border border-accent-cyan/30 flex items-center justify-center text-accent-cyan">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          {isPrivileged && systemClearing ? (
            <>
              <p className="text-3xl font-extrabold tabular-nums-mono text-cyan-300 mt-3">
                {formatINR(systemClearing.balance)}
              </p>
              <p className="text-xs text-slate-400 mt-2 font-mono">
                Zero-Sum Net: {formatINR(totalCustomerLiquidity + systemClearing.balance)}
              </p>
            </>
          ) : (
            <>
              <p className="text-2xl font-extrabold text-brand-300 mt-3">ACID Enforced</p>
              <p className="text-xs text-slate-400 mt-2">Double-entry + Idempotency active</p>
            </>
          )}
        </div>

        <div className="glass-card-hover p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {integrity ? 'SHA-256 Hash Chain' : 'Recent Activity'}
            </span>
            <div className="w-9 h-9 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-400">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          {integrity ? (
            <>
              <p className={`text-2xl font-extrabold mt-3 ${integrity.isMathematicallySound ? 'text-brand-400' : 'text-rose-400'}`}>
                {integrity.isMathematicallySound ? '100% INTACT' : 'ALERT: TAMPER'}
              </p>
              <p className="text-xs text-slate-400 mt-2 font-mono">
                {integrity.totalLedgerEntries} entries · Debits = Credits ({formatINR(integrity.totalDebits)})
              </p>
            </>
          ) : (
            <>
              <p className="text-3xl font-extrabold tabular-nums-mono text-white mt-3">{transactions.length}</p>
              <p className="text-xs text-slate-400 mt-2">Latest immutable ledger events</p>
            </>
          )}
        </div>

        <div className="glass-card-hover p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Security & Refusals
            </span>
            <div className="w-9 h-9 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <p className="text-3xl font-extrabold tabular-nums-mono text-white mt-3">{refusedCount}</p>
          <button
            onClick={() => onNavigate('adversarial')}
            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-300 hover:text-amber-200"
          >
            <Zap className="w-3.5 h-3.5" />
            Launch Adversarial Test Lab →
          </button>
        </div>
      </div>

      {/* Accounts Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">
            {isPrivileged ? 'Customer & Treasury Accounts' : 'Your Permitted Accounts'}
          </h3>
          <button onClick={() => onNavigate('accounts')} className="text-xs font-semibold text-brand-400 hover:text-brand-300">
            Manage All Accounts →
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {customerAccounts.slice(0, 6).map((acc) => (
            <div key={acc._id} className="glass-card-hover p-5 flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="px-2.5 py-0.5 rounded-md bg-slate-800/90 border border-slate-700 text-[11px] font-mono text-slate-300">
                    {acc.accountNumber}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase border ${
                      acc.status === 'ACTIVE'
                        ? 'bg-brand-500/15 text-brand-300 border-brand-500/30'
                        : acc.status === 'FROZEN'
                        ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                        : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                    }`}
                  >
                    {acc.status}
                  </span>
                </div>

                <h4 className="text-base font-bold text-white mt-3 truncate">{acc.name}</h4>
                <p className="text-xs text-slate-400">
                  {acc.accountType} {acc.ownerId?.email ? `· ${acc.ownerId.email}` : ''}
                </p>

                <div className="mt-4">
                  <p className="text-[11px] uppercase tracking-wider text-slate-400">Settled Balance</p>
                  <p className={`text-2xl font-extrabold tabular-nums-mono ${acc.balance < 0 ? 'text-amber-300' : 'text-white'}`}>
                    {formatINR(acc.balance)}
                  </p>
                  {acc.overdraftLimit > 0 && (
                    <p className="text-[11px] text-accent-cyan font-mono mt-0.5">
                      Authorized Overdraft Facility: {formatINR(acc.overdraftLimit)}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-3 border-t border-slate-800/80">
                <button
                  onClick={() => onSelectStatementAccount(acc._id)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-xs font-semibold text-slate-200 transition-colors"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-accent-cyan" />
                  Statement
                </button>
                {canTransact && (
                  <button
                    onClick={() => onOpenTransaction('WITHDRAWAL', acc._id)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-brand-500/15 hover:bg-brand-500/25 border border-brand-500/30 text-xs font-semibold text-brand-300 transition-colors"
                  >
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    Transact
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Transactions Table */}
      <div className="glass-card overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div>
            <h3 className="text-base font-bold text-white">Recent Ledger Activity</h3>
            <p className="text-xs text-slate-400">Click any row to inspect its balanced Double-Entry & SHA-256 legs</p>
          </div>
          <button onClick={() => onNavigate('transactions')} className="text-xs font-semibold text-brand-400 hover:text-brand-300">
            View Full Ledger →
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800/80 bg-navy-950/60 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <th className="py-3 px-6">Type</th>
                <th className="py-3 px-4">Route (Debit → Credit)</th>
                <th className="py-3 px-4">Amount</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Actor</th>
                <th className="py-3 px-6 text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-sm">
              {transactions.map((tx) => (
                <tr
                  key={tx.transactionId}
                  onClick={() => onInspectTransaction(tx.transactionId)}
                  className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                >
                  <td className="py-3.5 px-6 font-semibold text-white">{tx.type}</td>
                  <td className="py-3.5 px-4 font-mono text-xs text-slate-300">
                    {tx.sourceAccountId?.accountNumber || 'CLEARING'} → {tx.destinationAccountId?.accountNumber || 'CLEARING'}
                  </td>
                  <td className="py-3.5 px-4 font-mono font-bold text-white">
                    {formatINR(tx.amount)}
                  </td>
                  <td className="py-3.5 px-4">
                    {tx.status === 'POSTED' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-brand-500/15 text-brand-300 border border-brand-500/30">
                        <CheckCircle2 className="w-3 h-3" /> POSTED
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30">
                        <XCircle className="w-3 h-3" /> {tx.status}
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-xs text-slate-400">{tx.actorId?.email || 'System'}</td>
                  <td className="py-3.5 px-6 text-right text-xs font-mono text-slate-400">
                    {new Date(tx.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
              {transactions.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500 text-sm">
                    No transactions recorded yet.
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


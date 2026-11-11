import React, { useState, useEffect, useCallback } from 'react';
import {
  Wallet,
  Plus,
  ShieldAlert,
  Lock,
  Unlock,
  Ban,
  FileSpreadsheet,
  SlidersHorizontal,
  ArrowLeftRight,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { formatINR } from '../utils/formatCurrency';

export const AccountsPage = ({
  onOpenTransaction,
  onSelectStatementAccount,
  refreshTrigger,
  onAccountUpdated,
  addToast,
}) => {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Create form state
  const [name, setName] = useState('');
  const [accountType, setAccountType] = useState('CHECKING');
  const [ownerId, setOwnerId] = useState('');
  const [overdraftLimit, setOverdraftLimit] = useState('0');
  const [creating, setCreating] = useState(false);

  // Overdraft edit modal
  const [overdraftTarget, setOverdraftTarget] = useState(null);
  const [newOverdraftValue, setNewOverdraftValue] = useState('');
  const [overdraftJustification, setOverdraftJustification] = useState('');

  const isAdmin = user?.role === 'ADMIN';
  const isAuditor = user?.role === 'AUDITOR';
  const isPrivileged = isAdmin || isAuditor;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const requests = [isPrivileged ? api.accounts.getAll() : api.accounts.getMy()];
      if (isAdmin) {
        requests.push(api.accounts.getUsers());
      }
      const [accRes, usersRes] = await Promise.all(requests);
      setAccounts(accRes.data.accounts || []);
      if (usersRes) {
        setUsers(usersRes.data.users || []);
      }
    } catch (err) {
      addToast('error', 'Error Loading Accounts', err.message);
    } finally {
      setLoading(false);
    }
  }, [isPrivileged, isAdmin, addToast]);

  useEffect(() => {
    loadData();
  }, [loadData, refreshTrigger]);

  const handleCreateAccount = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      await api.accounts.create({
        name,
        accountType,
        ...(isAdmin && ownerId ? { ownerId } : {}),
        ...(isAdmin ? { overdraftLimit: Number(overdraftLimit) || 0 } : {}),
      });
      addToast('success', 'Account Created', 'Zero-balance ledger account initialized cleanly.');
      setShowCreateModal(false);
      setName('');
      setOverdraftLimit('0');
      onAccountUpdated();
    } catch (err) {
      addToast('error', 'Failed to Create Account', err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleStatusChange = async (accountId, newStatus) => {
    try {
      await api.accounts.updateStatus(accountId, newStatus);
      addToast('info', 'Account Status Changed', `Account updated to ${newStatus}`);
      onAccountUpdated();
    } catch (err) {
      addToast('error', 'Status Update Rejected', err.message);
    }
  };

  const handleSaveOverdraft = async (e) => {
    e.preventDefault();
    if (!overdraftTarget) return;
    try {
      await api.accounts.updateOverdraft(
        overdraftTarget._id,
        Number(newOverdraftValue),
        overdraftJustification || 'Authorized overdraft facility adjustment'
      );
      addToast('success', 'Overdraft Facility Updated', `Authorized limit updated to ${formatINR(newOverdraftValue)}`);
      setOverdraftTarget(null);
      onAccountUpdated();
    } catch (err) {
      addToast('error', 'Overdraft Update Failed', err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-white">Account Oversight & Management</h2>
          <p className="text-sm text-slate-400 mt-1">
            {isPrivileged
              ? 'Full visibility into customer accounts, system clearing accounts, status controls, and overdraft facilities.'
              : 'Your authorized accounts. Funds enter exclusively via balanced double-entry transactions.'}
          </p>
        </div>
        {!isAuditor && (
          <button onClick={() => setShowCreateModal(true)} className="btn-primary">
            <Plus className="w-4 h-4" />
            Open New Account
          </button>
        )}
      </div>

      {loading ? (
        <div className="glass-card p-12 text-center text-slate-400">Loading ledger accounts...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {accounts.map((acc) => (
            <div
              key={acc._id}
              className={`glass-card-hover p-6 flex flex-col justify-between space-y-5 ${
                acc.isSystem ? 'border-accent-cyan/30 bg-cyan-950/15' : ''
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-lg bg-navy-950 border border-slate-700 font-mono text-xs text-slate-200">
                      {acc.accountNumber}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-slate-800 text-[10px] font-bold uppercase text-slate-400">
                      {acc.accountType}
                    </span>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider border ${
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

                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-brand-400 shrink-0" />
                    {acc.name}
                  </h3>
                  {acc.ownerId ? (
                    <p className="text-xs text-slate-400 mt-0.5">
                      Owner: <span className="text-slate-200 font-medium">{acc.ownerId.fullName}</span> ({acc.ownerId.email})
                    </p>
                  ) : (
                    <p className="text-xs text-accent-cyan mt-0.5 font-mono">Institutional System Contra-Account</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-navy-950/75 border border-slate-800">
                  <div>
                    <p className="text-[11px] text-slate-400 uppercase tracking-wider">Ledger Balance</p>
                    <p
                      className={`text-xl font-extrabold tabular-nums-mono mt-0.5 ${
                        acc.balance < 0 ? 'text-amber-300' : 'text-white'
                      }`}
                    >
                      {formatINR(acc.balance)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-400 uppercase tracking-wider">Overdraft Facility</p>
                    <p className="text-xl font-bold tabular-nums-mono text-slate-300 mt-0.5">
                      {acc.isSystem ? 'Institutional' : formatINR(acc.overdraftLimit || 0)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Controls */}
              <div className="space-y-2.5 pt-3 border-t border-slate-800/80">
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => onSelectStatementAccount(acc._id)}
                    className="btn-secondary flex-1 py-2 text-xs"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-accent-cyan" />
                    Statement
                  </button>
                  {!isAuditor && !acc.isSystem && (
                    <button
                      onClick={() => onOpenTransaction('TRANSFER', acc._id)}
                      className="btn-primary flex-1 py-2 text-xs"
                    >
                      <ArrowLeftRight className="w-3.5 h-3.5" />
                      Transact
                    </button>
                  )}
                </div>

                {isAdmin && !acc.isSystem && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {acc.status !== 'ACTIVE' && (
                      <button
                        onClick={() => handleStatusChange(acc._id, 'ACTIVE')}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-brand-500/15 text-brand-300 border border-brand-500/30 text-xs font-semibold hover:bg-brand-500/25"
                      >
                        <Unlock className="w-3 h-3" /> Activate
                      </button>
                    )}
                    {acc.status !== 'FROZEN' && (
                      <button
                        onClick={() => handleStatusChange(acc._id, 'FROZEN')}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30 text-xs font-semibold hover:bg-amber-500/25"
                      >
                        <Lock className="w-3 h-3" /> Freeze
                      </button>
                    )}
                    {acc.status !== 'CLOSED' && (
                      <button
                        onClick={() => handleStatusChange(acc._id, 'CLOSED')}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-500/15 text-rose-300 border border-rose-500/30 text-xs font-semibold hover:bg-rose-500/25"
                      >
                        <Ban className="w-3 h-3" /> Close
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setOverdraftTarget(acc);
                        setNewOverdraftValue(String(acc.overdraftLimit || 0));
                        setOverdraftJustification('');
                      }}
                      className="ml-auto inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 text-xs font-semibold hover:text-white"
                    >
                      <SlidersHorizontal className="w-3 h-3" /> Overdraft
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Account Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="glass-card w-full max-w-md p-6 border-slate-700">
            <h3 className="text-lg font-bold text-white mb-1">Open New Financial Account</h3>
            <p className="text-xs text-slate-400 mb-5">
              All accounts start at ₹0.00 to strictly obey balance conservation.
            </p>
            <form onSubmit={handleCreateAccount} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Account Label
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Operating Reserve Checking"
                  required
                  className="input-field"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Account Type
                </label>
                <select
                  value={accountType}
                  onChange={(e) => setAccountType(e.target.value)}
                  className="input-field"
                >
                  <option value="CHECKING">CHECKING</option>
                  <option value="SAVINGS">SAVINGS</option>
                </select>
              </div>

              {isAdmin && (
                <>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                      Assign Account Holder
                    </label>
                    <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className="input-field">
                      <option value="">Self ({user.email})</option>
                      {users.map((u) => (
                        <option key={u._id} value={u._id}>
                          {u.fullName} ({u.email}) — {u.role}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                      Authorized Overdraft Limit (INR ₹)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={overdraftLimit}
                      onChange={(e) => setOverdraftLimit(e.target.value)}
                      className="input-field font-mono"
                    />
                  </div>
                </>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowCreateModal(false)} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={creating} className="btn-primary">
                  {creating ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Overdraft Modal */}
      {overdraftTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="glass-card w-full max-w-md p-6 border-slate-700">
            <div className="flex items-center gap-2 text-amber-300 mb-2">
              <ShieldAlert className="w-5 h-5" />
              <h3 className="text-lg font-bold text-white">Authorize Overdraft Arrangement</h3>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Account <span className="font-mono text-white">{overdraftTarget.accountNumber}</span> — requires documented authorization in the audit log.
            </p>
            <form onSubmit={handleSaveOverdraft} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Overdraft Limit (INR ₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={newOverdraftValue}
                  onChange={(e) => setNewOverdraftValue(e.target.value)}
                  required
                  className="input-field font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Documented Justification
                </label>
                <input
                  type="text"
                  value={overdraftJustification}
                  onChange={(e) => setOverdraftJustification(e.target.value)}
                  placeholder="Commercial line #890 approved by credit committee"
                  required
                  className="input-field"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setOverdraftTarget(null)} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Authorize Limit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};


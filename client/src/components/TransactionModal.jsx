import React, { useState, useEffect } from 'react';
import { X, ArrowDownLeft, ArrowUpRight, ArrowLeftRight, KeyRound, RefreshCw, ShieldCheck } from 'lucide-react';
import { api, generateIdempotencyKey } from '../services/api';

export const TransactionModal = ({
  isOpen,
  initialMode = 'DEPOSIT',
  accounts = [],
  directory = [],
  preselectedAccountId = '',
  onClose,
  onSuccess,
  addToast,
}) => {
  const [mode, setMode] = useState(initialMode);
  const [sourceAccountId, setSourceAccountId] = useState(preselectedAccountId);
  const [destinationAccountId, setDestinationAccountId] = useState(preselectedAccountId);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(generateIdempotencyKey());
  const [submitting, setSubmitting] = useState(false);
  const [lastTxResult, setLastTxResult] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      const firstActive = accounts.find((a) => !a.isSystem && a.status === 'ACTIVE') || accounts[0];
      const defaultId = preselectedAccountId || firstActive?._id || '';
      setSourceAccountId(defaultId);
      if (initialMode === 'DEPOSIT') {
        setDestinationAccountId(defaultId);
      } else {
        const other = directory.find((d) => d._id !== defaultId);
        setDestinationAccountId(other?._id || '');
      }
      setIdempotencyKey(generateIdempotencyKey());
      setLastTxResult(null);
      setAmount('');
      setDescription('');
    }
  }, [isOpen, initialMode, preselectedAccountId, accounts, directory]);

  if (!isOpen) return null;

  const customerAccounts = accounts.filter((a) => !a.isSystem);
  const recipientOptions = directory.filter((d) => d._id !== sourceAccountId);

  const handleSubmit = async (e, forceReplay = false) => {
    if (e) e.preventDefault();
    setSubmitting(true);

    try {
      const numericAmount = parseFloat(amount);
      if (!numericAmount || numericAmount <= 0) {
        addToast('error', 'Invalid Amount', 'Please enter an amount greater than $0.00.');
        setSubmitting(false);
        return;
      }

      let res;
      if (mode === 'DEPOSIT') {
        res = await api.transactions.deposit(
          { destinationAccountId, amount: numericAmount, description: description || 'Client Deposit' },
          idempotencyKey
        );
      } else if (mode === 'WITHDRAWAL') {
        res = await api.transactions.withdraw(
          { sourceAccountId, amount: numericAmount, description: description || 'Client Withdrawal' },
          idempotencyKey
        );
      } else {
        res = await api.transactions.transfer(
          {
            sourceAccountId,
            destinationAccountId,
            amount: numericAmount,
            description: description || 'Peer Account Transfer',
          },
          idempotencyKey
        );
      }

      setLastTxResult({ ...res.data, isReplay: res.isReplay || forceReplay });

      if (res.isReplay) {
        addToast(
          'info',
          'Idempotent Replay Intercepted',
          `Duplicate request with key ${idempotencyKey.slice(0, 12)}... returned cached outcome. Zero duplicate posting!`
        );
      } else {
        addToast(
          'success',
          `${mode} Posted Atomically`,
          `Transaction ${res.data.transactionId?.slice(0, 8)}... settled with balanced double-entry.`
        );
      }
      onSuccess();
    } catch (err) {
      addToast('error', 'Transaction Refused', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="glass-card w-full max-w-lg overflow-hidden border-slate-700/80">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-navy-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-500/20 border border-brand-500/40 flex items-center justify-center text-brand-400">
              {mode === 'DEPOSIT' ? (
                <ArrowDownLeft className="w-4 h-4" />
              ) : mode === 'WITHDRAWAL' ? (
                <ArrowUpRight className="w-4 h-4" />
              ) : (
                <ArrowLeftRight className="w-4 h-4" />
              )}
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Execute Ledger Transaction</h3>
              <p className="text-[11px] text-slate-400 font-mono">ACID Multi-Doc · Double-Entry Enforced</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="grid grid-cols-3 gap-2 p-4 pb-0">
          {['DEPOSIT', 'WITHDRAWAL', 'TRANSFER'].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setLastTxResult(null);
                setIdempotencyKey(generateIdempotencyKey());
              }}
              className={`py-2 px-3 rounded-xl text-xs font-bold tracking-wider uppercase transition-all border ${
                mode === m
                  ? 'bg-brand-500/20 text-brand-300 border-brand-500/50 shadow-glow-emerald'
                  : 'bg-navy-950/50 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Source Account */}
          {(mode === 'WITHDRAWAL' || mode === 'TRANSFER') && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Source Account (Debit)
              </label>
              <select
                value={sourceAccountId}
                onChange={(e) => setSourceAccountId(e.target.value)}
                required
                className="input-field"
              >
                <option value="">Select source account...</option>
                {customerAccounts.map((acc) => (
                  <option key={acc._id} value={acc._id}>
                    {acc.accountNumber} — {acc.name} (${acc.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Destination Account */}
          {(mode === 'DEPOSIT' || mode === 'TRANSFER') && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Destination Account (Credit)
              </label>
              <select
                value={destinationAccountId}
                onChange={(e) => setDestinationAccountId(e.target.value)}
                required
                className="input-field"
              >
                <option value="">Select destination account...</option>
                {(mode === 'DEPOSIT' ? customerAccounts : recipientOptions).map((acc) => (
                  <option key={acc._id} value={acc._id}>
                    {acc.accountNumber} — {acc.name}
                    {acc.balance !== undefined ? ` ($${acc.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Amount & Description */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Amount (USD)
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                required
                className="input-field font-mono text-base font-bold text-brand-300"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Memo / Description
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional memo..."
                className="input-field"
              />
            </div>
          </div>

          {/* Idempotency Key Box */}
          <div className="p-3.5 rounded-xl bg-navy-950/90 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent-cyan">
                <KeyRound className="w-3.5 h-3.5" />
                Idempotency-Key Header
              </span>
              <button
                type="button"
                onClick={() => {
                  setIdempotencyKey(generateIdempotencyKey());
                  setLastTxResult(null);
                }}
                className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-white transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Rotate Key
              </button>
            </div>
            <input
              type="text"
              value={idempotencyKey}
              onChange={(e) => setIdempotencyKey(e.target.value)}
              className="w-full bg-transparent text-xs font-mono text-slate-300 focus:outline-none"
            />
          </div>

          {/* Last Result Replay Box */}
          {lastTxResult && (
            <div className="p-3.5 rounded-xl bg-brand-500/10 border border-brand-500/30 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-bold text-brand-300 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" />
                  {lastTxResult.isReplay ? 'Cached Replay Returned (No Double-Spend)' : 'Posted Successfully'}
                </p>
                <p className="text-[11px] font-mono text-slate-400 truncate mt-0.5">
                  TX: {lastTxResult.transactionId}
                </p>
              </div>
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleSubmit(null, true)}
                className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold bg-accent-cyan/20 text-cyan-300 border border-accent-cyan/40 hover:bg-accent-cyan/30 transition-colors"
              >
                Replay Same Key
              </button>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Close
            </button>
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? 'Committing ACID Tx...' : `Post ${mode}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

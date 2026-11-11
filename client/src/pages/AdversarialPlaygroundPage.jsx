import React, { useState, useEffect } from 'react';
import {
  Zap,
  ShieldCheck,
  AlertOctagon,
  Repeat,
  Lock,
  Cpu,
  Play,
  CheckCircle2,
  Terminal,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { formatINR } from '../utils/formatCurrency';

export const AdversarialPlaygroundPage = ({ onLedgerMutated, addToast }) => {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [directory, setDirectory] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [concurrencyCount, setConcurrencyCount] = useState(10);
  const [concurrencyAmount, setConcurrencyAmount] = useState(500);
  const [runningScenario, setRunningScenario] = useState('');
  const [results, setResults] = useState({});

  const isPrivileged = user?.role === 'ADMIN' || user?.role === 'AUDITOR';
  const canExecuteWrites = user?.role === 'ADMIN' || user?.role === 'ACCOUNT_HOLDER';

  useEffect(() => {
    const loadAccounts = async () => {
      try {
        const [accRes, dirRes] = await Promise.all([
          isPrivileged ? api.accounts.getAll() : api.accounts.getMy(),
          api.accounts.getDirectory(),
        ]);
        const custAccs = (accRes.data.accounts || []).filter((a) => !a.isSystem);
        setAccounts(custAccs);
        setDirectory(dirRes.data.directory || []);
        if (custAccs.length > 0) {
          setSelectedAccountId(custAccs[0]._id);
        }
      } catch (err) {
        addToast('error', 'Failed to load accounts for lab', err.message);
      }
    };
    loadAccounts();
  }, [isPrivileged, addToast]);

  const executeScenario = async (key, fn, mutatesLedger = false) => {
    setRunningScenario(key);
    try {
      const { data } = await fn();
      setResults((prev) => ({ ...prev, [key]: { status: 'PASS', data, timestamp: new Date().toISOString() } }));
      addToast('success', `${key} Completed`, 'All system security and integrity invariants held.');
      if (mutatesLedger) {
        onLedgerMutated();
        // Refresh account balances in lab dropdown
        const accRes = isPrivileged ? await api.accounts.getAll() : await api.accounts.getMy();
        setAccounts((accRes.data.accounts || []).filter((a) => !a.isSystem));
      }
    } catch (err) {
      setResults((prev) => ({
        ...prev,
        [key]: { status: 'BLOCKED_OR_ERROR', data: err.data || { message: err.message }, timestamp: new Date().toISOString() },
      }));
      addToast('info', `${key} Response`, err.message);
    } finally {
      setRunningScenario('');
    }
  };

  const victimCandidate = directory.find((d) => !accounts.some((a) => a._id === d._id)) || directory[0];

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="glass-card p-6 border-rose-500/30 bg-gradient-to-r from-navy-900 via-rose-950/20 to-navy-900">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/40 text-rose-300 text-[11px] font-bold uppercase tracking-wider">
              <Zap className="w-3.5 h-3.5" /> Interactive Security & Invariant Stress Lab
            </div>
            <h2 className="text-2xl font-extrabold text-white">Adversarial Testing Playground</h2>
            <p className="text-sm text-slate-300 max-w-2xl">
              Execute live concurrency race attacks, idempotency replay probes, overdraft exhaustions, RBAC violations, and cryptographic tamper tests directly against the MongoDB Atlas ledger.
            </p>
          </div>

          {accounts.length > 0 && (
            <div className="min-w-[260px]">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Target Test Account
              </label>
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="input-field"
              >
                {accounts.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.accountNumber} ({formatINR(a.balance)})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Scenarios Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 1. Concurrency Race Attack */}
        <div className="glass-card-hover p-6 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-base font-bold text-white">
                <Cpu className="w-5 h-5 text-accent-cyan" />
                1. Concurrent Withdrawal Race Attack
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                ACID + OCC
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Launches simultaneous asynchronous withdrawal requests at the exact same millisecond using <code className="text-cyan-300">Promise.allSettled</code>. Proves zero double-spending and deterministic balance conservation.
            </p>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[10px] uppercase text-slate-400 mb-1">Parallel Threads</label>
                <input
                  type="number"
                  min="2"
                  max="20"
                  value={concurrencyCount}
                  onChange={(e) => setConcurrencyCount(e.target.value)}
                  className="input-field py-1.5 font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase text-slate-400 mb-1">Amount / Thread (₹)</label>
                <input
                  type="number"
                  min="1"
                  value={concurrencyAmount}
                  onChange={(e) => setConcurrencyAmount(e.target.value)}
                  className="input-field py-1.5 font-mono text-xs"
                />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <button
              disabled={!canExecuteWrites || !selectedAccountId || runningScenario === 'CONCURRENCY'}
              onClick={() =>
                executeScenario(
                  'CONCURRENCY',
                  () =>
                    api.adversarial.runConcurrency({
                      accountId: selectedAccountId,
                      count: Number(concurrencyCount),
                      amount: Number(concurrencyAmount),
                    }),
                  true
                )
              }
              className="btn-primary w-full"
            >
              <Play className="w-4 h-4" />
              {runningScenario === 'CONCURRENCY'
                ? 'Firing Simultaneous Threads...'
                : !canExecuteWrites
                ? 'Read-Only Role (Auditor Blocked)'
                : `Launch ${concurrencyCount}x Concurrent Withdrawals`}
            </button>

            {results.CONCURRENCY && <ResultViewer result={results.CONCURRENCY} />}
          </div>
        </div>

        {/* 2. Idempotency Replay Attack */}
        <div className="glass-card-hover p-6 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-base font-bold text-white">
                <Repeat className="w-5 h-5 text-brand-400" />
                2. Idempotency-Key Replay Attack
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-brand-500/15 text-brand-300 border border-brand-500/30">
                UNIQUE KEY LOCK
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Fires 5 identical ₹15.00 deposit requests carrying the exact same <code className="text-brand-300">Idempotency-Key</code>. Verifies that only 1 ledger posting occurs and 4 replays return the original outcome.
            </p>
          </div>

          <div className="space-y-3">
            <button
              disabled={!canExecuteWrites || !selectedAccountId || runningScenario === 'IDEMPOTENCY'}
              onClick={() =>
                executeScenario(
                  'IDEMPOTENCY',
                  () => api.adversarial.runIdempotency({ accountId: selectedAccountId, amount: 15 }),
                  true
                )
              }
              className="btn-primary w-full"
            >
              <Play className="w-4 h-4" />
              {runningScenario === 'IDEMPOTENCY'
                ? 'Replaying 5x Requests...'
                : !canExecuteWrites
                ? 'Read-Only Role (Auditor Blocked)'
                : 'Simulate 5x Duplicate Replay Attack'}
            </button>

            {results.IDEMPOTENCY && <ResultViewer result={results.IDEMPOTENCY} />}
          </div>
        </div>

        {/* 3. Overdraft Exhaustion Attack */}
        <div className="glass-card-hover p-6 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-base font-bold text-white">
                <AlertOctagon className="w-5 h-5 text-rose-400" />
                3. Overdraft Exhaustion Probe
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-rose-500/15 text-rose-300 border border-rose-500/30">
                INVARIANT #4
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Attempts to withdraw ₹50,000 above the account's available balance + authorized overdraft. Confirms deterministic refusal, untouched balance, and statement/audit logging.
            </p>
          </div>

          <div className="space-y-3">
            <button
              disabled={!canExecuteWrites || !selectedAccountId || runningScenario === 'OVERDRAFT'}
              onClick={() =>
                executeScenario(
                  'OVERDRAFT',
                  () => api.adversarial.runOverdraft({ accountId: selectedAccountId }),
                  true
                )
              }
              className="btn-danger w-full"
            >
              <Play className="w-4 h-4" />
              {runningScenario === 'OVERDRAFT' ? 'Executing Overdraft Probe...' : 'Attempt Unauthorized Overdraft'}
            </button>

            {results.OVERDRAFT && <ResultViewer result={results.OVERDRAFT} />}
          </div>
        </div>

        {/* 4. Cross-Account RBAC & Ownership Attack */}
        <div className="glass-card-hover p-6 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-base font-bold text-white">
                <Lock className="w-5 h-5 text-amber-400" />
                4. Cross-Account Ownership Bypass Probe
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/15 text-amber-300 border border-amber-500/30">
                SERVER RBAC
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Probes server-side account ownership enforcement by attempting a transfer from a third-party account ({victimCandidate?.accountNumber || 'target'}). Confirms 403 block and immutable security alert.
            </p>
          </div>

          <div className="space-y-3">
            <button
              disabled={!victimCandidate || runningScenario === 'RBAC'}
              onClick={() =>
                executeScenario('RBAC', () =>
                  api.adversarial.runUnauthorizedTransfer({
                    victimAccountId: victimCandidate?._id,
                    destinationAccountId: selectedAccountId || victimCandidate?._id,
                    amount: 500,
                  })
                )
              }
              className="btn-secondary w-full border-amber-500/40 text-amber-300"
            >
              <Play className="w-4 h-4" />
              {runningScenario === 'RBAC' ? 'Probing RBAC Boundary...' : 'Launch Unauthorized Transfer Probe'}
            </button>

            {results.RBAC && <ResultViewer result={results.RBAC} />}
          </div>
        </div>

        {/* 5. Cryptographic Tamper Detection Simulation */}
        <div className="lg:col-span-2 glass-card-hover p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="inline-flex items-center gap-2 text-base font-bold text-white">
                <ShieldCheck className="w-5 h-5 text-violet-400" />
                5. Append-Only & SHA-256 Tamper Detection Simulation
              </span>
              <p className="text-xs text-slate-400 max-w-2xl">
                Tests both Mongoose schema-level update guards (blocking direct <code className="text-violet-300">LedgerEntry.updateOne</code>) AND simulates a ₹0.01 out-of-band tampering payload to prove the SHA-256 hash chain instantly detects manipulation without altering live records.
              </p>
            </div>
            <button
              disabled={runningScenario === 'TAMPER'}
              onClick={() => executeScenario('TAMPER', () => api.adversarial.runTamperSimulate())}
              className="btn-primary shrink-0 from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500"
            >
              <Play className="w-4 h-4" />
              {runningScenario === 'TAMPER' ? 'Simulating Tamper...' : 'Run Tamper Detection Test'}
            </button>
          </div>

          {results.TAMPER && <ResultViewer result={results.TAMPER} />}
        </div>
      </div>
    </div>
  );
};

const ResultViewer = ({ result }) => (
  <div className="p-3.5 rounded-xl bg-navy-950/90 border border-slate-800 space-y-2">
    <div className="flex items-center justify-between">
      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-brand-400">
        <CheckCircle2 className="w-3.5 h-3.5" />
        INVARIANT PROOF TELEMETRY
      </span>
      <span className="inline-flex items-center gap-1 text-[10px] font-mono text-slate-500">
        <Terminal className="w-3 h-3" /> {new Date(result.timestamp).toLocaleTimeString()}
      </span>
    </div>
    <pre className="text-[11px] font-mono text-slate-300 overflow-x-auto max-h-60 leading-relaxed">
      {JSON.stringify(result.data, null, 2)}
    </pre>
  </div>
);


import React, { useState, useEffect } from 'react';
import { Landmark, ShieldCheck, Lock, Zap, ArrowRight, UserCheck, Eye, Shield, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';

const DEMO_ACCOUNTS = [
  {
    label: 'Account Holder (Alex)',
    role: 'ACCOUNT_HOLDER',
    email: 'alex.holder@ledgerline.io',
    password: 'Holder@123456',
    desc: 'Deposits, withdrawals, transfers & personal statements',
    color: 'border-brand-500/40 bg-brand-500/10 hover:border-brand-400 text-brand-300',
    Icon: UserCheck,
  },
  {
    label: 'Account Holder (Sarah)',
    role: 'ACCOUNT_HOLDER',
    email: 'sarah.smith@ledgerline.io',
    password: 'Holder@123456',
    desc: 'Commercial Reserve (₹500 authorized overdraft) & Checking',
    color: 'border-accent-cyan/40 bg-accent-cyan/10 hover:border-cyan-400 text-cyan-300',
    Icon: UserCheck,
  },
  {
    label: 'Chief Admin',
    role: 'ADMIN',
    email: 'admin@ledgerline.io',
    password: 'Admin@123456',
    desc: 'Full user oversight, freeze/unfreeze, overdraft & audit control',
    color: 'border-violet-500/40 bg-violet-500/10 hover:border-violet-400 text-violet-300',
    Icon: Shield,
  },
  {
    label: 'Lead Auditor',
    role: 'AUDITOR',
    email: 'auditor@ledgerline.io',
    password: 'Auditor@123456',
    desc: 'Read-only system oversight, SHA-256 verification & audit logs',
    color: 'border-amber-500/40 bg-amber-500/10 hover:border-amber-400 text-amber-300',
    Icon: Eye,
  },
];

export const LoginPage = ({ addToast }) => {
  const { login, register } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [apiStatus, setApiStatus] = useState({ checked: false, ok: false, label: 'Checking API...' });

  useEffect(() => {
    api
      .health()
      .then(() => setApiStatus({ checked: true, ok: true, label: 'API & MongoDB Atlas Online' }))
      .catch(() =>
        setApiStatus({
          checked: true,
          ok: false,
          label: 'Backend API Offline — start server via "npm start" or "npm run dev"',
        })
      );
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setFormError('');
    try {
      if (isRegister) {
        await register({ fullName, email, password });
        addToast('success', 'Account Registered', 'Welcome to LedgerLine Secure Core.');
      } else {
        await login(email, password);
        addToast('success', 'Authenticated', 'Secure session established.');
      }
    } catch (err) {
      setFormError(err.message);
      addToast('error', 'Authentication Failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  const quickLogin = async (demo) => {
    setEmail(demo.email);
    setPassword(demo.password);
    setIsRegister(false);
    setFormError('');
    setLoading(true);
    try {
      await login(demo.email, demo.password);
      addToast('success', `Signed in as ${demo.role}`, demo.email);
    } catch (err) {
      setFormError(err.message);
      addToast('error', 'Quick Login Failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-8 relative overflow-hidden">
      {/* Ambient glowing orbs */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-brand-500/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-accent-cyan/15 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-center relative z-10">
        {/* Left Hero & Quick Demo Selector */}
        <div className="lg:col-span-7 space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-500/10 border border-brand-500/30 text-brand-300 text-xs font-semibold">
            <ShieldCheck className="w-4 h-4" />
            Double-Entry · MongoDB ACID · SHA-256 Hash Chain
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-3.5">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 via-emerald-400 to-accent-cyan flex items-center justify-center shadow-glow-emerald">
                <Landmark className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-white via-emerald-100 to-cyan-200 bg-clip-text text-transparent">
                  LedgerLine
                </h1>
                <p className="text-sm font-mono text-brand-400 uppercase tracking-widest">
                  Zero-Discrepancy Financial Engine
                </p>
              </div>
            </div>
            <p className="text-slate-300 text-base leading-relaxed max-w-xl">
              An immutable, concurrency-safe banking ledger engineered with strict double-entry bookkeeping,
              idempotent request locks, server-side RBAC, and live cryptographic audit proofs.
            </p>
          </div>

          {/* 1-Click Seeded Roles */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              1-Click Seeded Role Sign-In (For Reviewers)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {DEMO_ACCOUNTS.map((demo) => {
                const Icon = demo.Icon;
                return (
                  <button
                    key={demo.email}
                    type="button"
                    disabled={loading}
                    onClick={() => quickLogin(demo)}
                    className={`text-left p-4 rounded-2xl border backdrop-blur-xl transition-all duration-200 group ${demo.color}`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider">
                        <Icon className="w-3.5 h-3.5" />
                        {demo.label}
                      </span>
                      <ArrowRight className="w-4 h-4 opacity-50 group-hover:translate-x-1 group-hover:opacity-100 transition-all" />
                    </div>
                    <p className="text-[11px] font-mono text-slate-300 truncate">{demo.email}</p>
                    <p className="text-[11px] text-slate-400 mt-1 line-clamp-1">{demo.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Auth Card */}
        <div className="lg:col-span-5">
          <div className="glass-card p-6 sm:p-8 border-slate-700/80 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-white">
                  {isRegister ? 'Create Holder Account' : 'Secure Portal Login'}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {isRegister ? 'Register a new ACCOUNT_HOLDER identity' : 'JWT-authenticated server session'}
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-slate-800/90 border border-slate-700 flex items-center justify-center text-brand-400">
                <Lock className="w-5 h-5" />
              </div>
            </div>

            {apiStatus.checked && (
              <div
                className={`mb-4 px-3 py-2 rounded-xl border text-xs flex items-center gap-2 ${
                  apiStatus.ok
                    ? 'bg-brand-500/10 border-brand-500/30 text-brand-300'
                    : 'bg-rose-500/15 border-rose-500/40 text-rose-200'
                }`}
              >
                {apiStatus.ok ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-brand-400" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                )}
                <span>{apiStatus.label}</span>
              </div>
            )}

            {formError && (
              <div className="mb-4 px-3.5 py-2.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-xs text-rose-200 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {isRegister && (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Jordan Blake"
                    required
                    className="input-field"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@ledgerline.io"
                  required
                  className="input-field"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  minLength={6}
                  className="input-field"
                />
              </div>

              <button type="submit" disabled={loading} className="btn-primary w-full py-3 mt-2">
                {loading ? 'Verifying Credentials...' : isRegister ? 'Register & Enter Vault' : 'Sign In to Vault'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-slate-800 text-center">
              <button
                type="button"
                onClick={() => setIsRegister(!isRegister)}
                className="text-xs font-medium text-slate-400 hover:text-brand-300 transition-colors"
              >
                {isRegister ? 'Already have credentials? Sign in' : 'Need a new customer account? Register here'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};


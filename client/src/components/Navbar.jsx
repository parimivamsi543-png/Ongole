import React, { useState } from 'react';
import {
  Landmark,
  LayoutDashboard,
  Wallet,
  ArrowLeftRight,
  FileSpreadsheet,
  ShieldCheck,
  Zap,
  BookOpen,
  LogOut,
  Menu,
  X,
  Lock,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { RoleBadge } from './RoleBadge';

export const Navbar = ({ activeTab, setActiveTab }) => {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = [
    { id: 'dashboard', label: 'Overview', icon: LayoutDashboard, roles: ['ADMIN', 'ACCOUNT_HOLDER', 'AUDITOR'] },
    { id: 'accounts', label: 'Accounts', icon: Wallet, roles: ['ADMIN', 'ACCOUNT_HOLDER', 'AUDITOR'] },
    { id: 'transactions', label: 'Double-Entry Ledger', icon: ArrowLeftRight, roles: ['ADMIN', 'ACCOUNT_HOLDER', 'AUDITOR'] },
    { id: 'statements', label: 'Statements', icon: FileSpreadsheet, roles: ['ADMIN', 'ACCOUNT_HOLDER', 'AUDITOR'] },
    { id: 'audit', label: 'Audit & Cryptographic Proof', icon: ShieldCheck, roles: ['ADMIN', 'AUDITOR'] },
    { id: 'adversarial', label: 'Adversarial Lab', icon: Zap, roles: ['ADMIN', 'ACCOUNT_HOLDER', 'AUDITOR'] },
    { id: 'architecture', label: 'System Specs & API', icon: BookOpen, roles: ['ADMIN', 'ACCOUNT_HOLDER', 'AUDITOR'] },
  ];

  const visibleItems = navItems.filter((item) => item.roles.includes(user?.role));

  const handleNav = (id) => {
    setActiveTab(id);
    setMobileOpen(false);
  };

  return (
    <>
      {/* Mobile Header */}
      <div className="lg:hidden no-print sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-navy-900/90 backdrop-blur-xl border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-accent-cyan flex items-center justify-center shadow-glow-emerald">
            <Landmark className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="font-extrabold tracking-tight text-lg bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
              LedgerLine
            </span>
            <p className="text-[10px] text-brand-400 font-mono uppercase tracking-widest">Secure Core</p>
          </div>
        </div>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-2 rounded-xl bg-slate-800/80 text-slate-200 hover:text-white"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Sidebar */}
      <aside
        className={`no-print fixed inset-y-0 left-0 z-40 w-72 bg-navy-900/95 backdrop-blur-2xl border-r border-slate-800/80 flex flex-col transition-transform duration-300 lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Logo */}
        <div className="p-6 border-b border-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-brand-500 via-emerald-400 to-accent-cyan flex items-center justify-center shadow-glow-emerald">
              <Landmark className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-white via-emerald-100 to-cyan-200 bg-clip-text text-transparent">
                LedgerLine
              </h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-brand-400 animate-pulse" />
                <span className="text-[11px] font-mono text-brand-400 tracking-wider uppercase">
                  ACID · SHA-256 Chain
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-4 py-5 space-y-1.5 overflow-y-auto">
          <p className="px-3 text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-2">
            Core Operations
          </p>
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNav(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                  active
                    ? 'bg-gradient-to-r from-brand-500/20 to-accent-cyan/10 text-brand-300 border border-brand-500/30 shadow-glow-emerald'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50 border border-transparent'
                }`}
              >
                <Icon className={`w-4 h-4 ${active ? 'text-brand-400' : 'text-slate-400'}`} />
                <span className="truncate">{item.label}</span>
                {item.id === 'adversarial' && (
                  <span className="ml-auto px-1.5 py-0.5 text-[10px] font-bold rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                    LAB
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* User Footer */}
        <div className="p-4 border-t border-slate-800/80 bg-navy-950/50">
          <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-bold text-white truncate">{user?.fullName}</p>
                <p className="text-xs text-slate-400 truncate font-mono">{user?.email}</p>
              </div>
              <Lock className="w-4 h-4 text-brand-400 shrink-0 mt-0.5" />
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <RoleBadge role={user?.role} compact />
              <button
                onClick={logout}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                title="Sign out"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
        />
      )}
    </>
  );
};

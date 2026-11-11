import React from 'react';
import { BookOpen, Shield, Database, Lock, Cpu, Scale, Server } from 'lucide-react';

export const ArchitectureDocPage = () => {
  const invariants = [
    {
      title: '1. Double-Entry Accounting',
      desc: 'Every transaction posts exactly balanced DEBIT and CREDIT legs into the LedgerEntry collection. For every transaction and across the entire ledger, Sum(Debits) === Sum(Credits).',
      icon: Scale,
    },
    {
      title: '2. Multi-Document ACID Atomicity',
      desc: 'Wrapped in MongoDB Atlas Replica Set sessions (session.startTransaction / commitTransaction). Either both accounts, the transaction header, chain lock, and ledger legs commit together, or zero state changes occur.',
      icon: Database,
    },
    {
      title: '3. Balance Conservation',
      desc: 'Deposits draw from SYS-CLEARING-001; withdrawals settle to SYS-CLEARING-001; transfers move funds atomically between customer accounts. Net sum of all balances across the universe is always $0.00.',
      icon: Server,
    },
    {
      title: '4. Negative Balance Prevention',
      desc: 'Enforces availableBalance = balance + overdraftLimit >= amount inside the ACID transaction. Accounts default to $0 overdraft unless explicitly configured and audited by an ADMIN.',
      icon: Shield,
    },
    {
      title: '5. Append-Only & SHA-256 Chain',
      desc: 'HTTP PUT/PATCH/DELETE return 405 Method Not Allowed, Mongoose hooks reject updates/deletes, and every entry stores a SHA-256 hash chaining sequenceNumber + previousHash + payload.',
      icon: Lock,
    },
    {
      title: '6. Idempotency & Concurrency Control',
      desc: 'Idempotency-Key middleware computes canonical SHA-256 payload hashes, locks in-flight requests, replays cached outcomes, and rejects payload mutations (409 Conflict). OCC + chain locks serialize concurrent bursts.',
      icon: Cpu,
    },
  ];

  const endpoints = [
    { method: 'POST', path: '/api/auth/login', role: 'Public', desc: 'Authenticate & receive JWT' },
    { method: 'GET', path: '/api/accounts/my', role: 'Authenticated', desc: 'List permitted accounts owned by actor' },
    { method: 'GET', path: '/api/accounts', role: 'ADMIN, AUDITOR', desc: 'List all customer & system accounts' },
    { method: 'PATCH', path: '/api/accounts/:id/status', role: 'ADMIN', desc: 'Update status (ACTIVE, FROZEN, CLOSED)' },
    { method: 'PATCH', path: '/api/accounts/:id/overdraft', role: 'ADMIN', desc: 'Configure documented overdraft facility' },
    { method: 'POST', path: '/api/transactions/deposit', role: 'ADMIN, HOLDER', desc: 'Idempotent double-entry deposit' },
    { method: 'POST', path: '/api/transactions/withdraw', role: 'ADMIN, HOLDER', desc: 'Idempotent double-entry withdrawal' },
    { method: 'POST', path: '/api/transactions/transfer', role: 'ADMIN, HOLDER', desc: 'Idempotent atomic peer transfer' },
    { method: 'GET', path: '/api/statements/:accountId', role: 'Owner / ADMIN / AUDITOR', desc: 'Full statement with refused attempts & actor' },
    { method: 'GET', path: '/api/audit/logs', role: 'ADMIN, AUDITOR', desc: 'Immutable security & activity audit log' },
    { method: 'GET', path: '/api/audit/integrity', role: 'ADMIN, AUDITOR', desc: 'Full cryptographic SHA-256 & sum audit' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-extrabold text-white flex items-center gap-2.5">
          <BookOpen className="w-6 h-6 text-brand-400" />
          System Architecture & API Specification
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Engineering guarantees, financial invariants, role matrix, and REST endpoints implemented in LedgerLine.
        </p>
      </div>

      {/* Invariants Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {invariants.map((inv) => {
          const Icon = inv.icon;
          return (
            <div key={inv.title} className="glass-card p-5 space-y-2.5">
              <div className="flex items-center gap-2.5 text-brand-300">
                <div className="w-8 h-8 rounded-lg bg-brand-500/15 border border-brand-500/30 flex items-center justify-center">
                  <Icon className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-sm text-white">{inv.title}</h3>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">{inv.desc}</p>
            </div>
          );
        })}
      </div>

      {/* API Table */}
      <div className="glass-card overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800">
          <h3 className="text-base font-bold text-white">REST API Endpoint Reference</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-navy-950/70 uppercase tracking-wider text-slate-400">
                <th className="py-3 px-5">Method</th>
                <th className="py-3 px-4">Endpoint</th>
                <th className="py-3 px-4">Server RBAC Policy</th>
                <th className="py-3 px-5">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {endpoints.map((ep) => (
                <tr key={ep.method + ep.path} className="hover:bg-slate-800/30">
                  <td className="py-3 px-5">
                    <span
                      className={`px-2 py-0.5 rounded font-mono font-bold ${
                        ep.method === 'GET'
                          ? 'bg-cyan-500/15 text-cyan-300'
                          : ep.method === 'POST'
                          ? 'bg-brand-500/15 text-brand-300'
                          : 'bg-amber-500/15 text-amber-300'
                      }`}
                    >
                      {ep.method}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-200">{ep.path}</td>
                  <td className="py-3 px-4 font-mono text-violet-300">{ep.role}</td>
                  <td className="py-3 px-5 text-slate-300">{ep.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

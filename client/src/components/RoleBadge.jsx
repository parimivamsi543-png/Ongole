import React from 'react';
import { Shield, User, Eye } from 'lucide-react';

const ROLE_STYLES = {
  ADMIN: {
    label: 'ADMIN',
    classes: 'bg-violet-500/15 text-violet-300 border-violet-500/40 shadow-glow-violet',
    Icon: Shield,
  },
  ACCOUNT_HOLDER: {
    label: 'ACCOUNT HOLDER',
    classes: 'bg-brand-500/15 text-brand-300 border-brand-500/40',
    Icon: User,
  },
  AUDITOR: {
    label: 'AUDITOR (READ-ONLY)',
    classes: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
    Icon: Eye,
  },
};

export const RoleBadge = ({ role, compact = false }) => {
  const cfg = ROLE_STYLES[role] || ROLE_STYLES.ACCOUNT_HOLDER;
  const Icon = cfg.Icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase border ${cfg.classes}`}
    >
      <Icon className="w-3 h-3" />
      {compact ? role : cfg.label}
    </span>
  );
};


import React, { useState, useCallback, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { api } from './services/api';
import { Navbar } from './components/Navbar';
import { ToastContainer } from './components/Toast';
import { TransactionModal } from './components/TransactionModal';
import { LedgerInspectorModal } from './components/LedgerInspectorModal';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { AccountsPage } from './pages/AccountsPage';
import { TransactionsPage } from './pages/TransactionsPage';
import { StatementsPage } from './pages/StatementsPage';
import { AuditLogsPage } from './pages/AuditLogsPage';
import { AdversarialPlaygroundPage } from './pages/AdversarialPlaygroundPage';
import { ArchitectureDocPage } from './pages/ArchitectureDocPage';

const MainShell = () => {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [toasts, setToasts] = useState([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Transaction Modal state
  const [txModalState, setTxModalState] = useState({
    isOpen: false,
    mode: 'DEPOSIT',
    preselectedAccountId: '',
  });
  const [modalAccounts, setModalAccounts] = useState([]);
  const [modalDirectory, setModalDirectory] = useState([]);

  // Inspector & Statement State
  const [inspectedTxId, setInspectedTxId] = useState(null);
  const [selectedStatementAccountId, setSelectedStatementAccountId] = useState('');

  const addToast = useCallback((type, title, message) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5500);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Reset tab when user switches roles
  useEffect(() => {
    setActiveTab('dashboard');
    setSelectedStatementAccountId('');
  }, [user?.id]);

  const handleOpenTransaction = useCallback(
    async (mode = 'DEPOSIT', preselectedAccountId = '') => {
      try {
        const isAdmin = user?.role === 'ADMIN';
        const [accRes, dirRes] = await Promise.all([
          isAdmin ? api.accounts.getAll() : api.accounts.getMy(),
          api.accounts.getDirectory(),
        ]);
        setModalAccounts(accRes.data.accounts || []);
        setModalDirectory(dirRes.data.directory || []);
        setTxModalState({ isOpen: true, mode, preselectedAccountId });
      } catch (err) {
        addToast('error', 'Unable to open transaction window', err.message);
      }
    },
    [user?.role, addToast]
  );

  const handleSelectStatementAccount = (accountId) => {
    setSelectedStatementAccountId(accountId);
    setActiveTab('statements');
  };

  const triggerRefresh = () => setRefreshTrigger((prev) => prev + 1);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-navy-950 text-brand-400 font-mono text-sm">
        Initializing Cryptographic Vault Session...
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <LoginPage addToast={addToast} />
        <ToastContainer toasts={toasts} removeToast={removeToast} />
      </>
    );
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />

      <main className="flex-1 lg:pl-72 min-w-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {activeTab === 'dashboard' && (
            <DashboardPage
              onOpenTransaction={handleOpenTransaction}
              onInspectTransaction={setInspectedTxId}
              onNavigate={setActiveTab}
              onSelectStatementAccount={handleSelectStatementAccount}
              refreshTrigger={refreshTrigger}
              addToast={addToast}
            />
          )}

          {activeTab === 'accounts' && (
            <AccountsPage
              onOpenTransaction={handleOpenTransaction}
              onSelectStatementAccount={handleSelectStatementAccount}
              refreshTrigger={refreshTrigger}
              onAccountUpdated={triggerRefresh}
              addToast={addToast}
            />
          )}

          {activeTab === 'transactions' && (
            <TransactionsPage
              onOpenTransaction={handleOpenTransaction}
              onInspectTransaction={setInspectedTxId}
              refreshTrigger={refreshTrigger}
              addToast={addToast}
            />
          )}

          {activeTab === 'statements' && (
            <StatementsPage
              selectedAccountId={selectedStatementAccountId}
              setSelectedAccountId={setSelectedStatementAccountId}
              addToast={addToast}
            />
          )}

          {activeTab === 'audit' && (user.role === 'ADMIN' || user.role === 'AUDITOR') && (
            <AuditLogsPage addToast={addToast} />
          )}

          {activeTab === 'adversarial' && (
            <AdversarialPlaygroundPage onLedgerMutated={triggerRefresh} addToast={addToast} />
          )}

          {activeTab === 'architecture' && <ArchitectureDocPage />}
        </div>
      </main>

      <TransactionModal
        isOpen={txModalState.isOpen}
        initialMode={txModalState.mode}
        accounts={modalAccounts}
        directory={modalDirectory}
        preselectedAccountId={txModalState.preselectedAccountId}
        onClose={() => setTxModalState((s) => ({ ...s, isOpen: false }))}
        onSuccess={triggerRefresh}
        addToast={addToast}
      />

      <LedgerInspectorModal
        transactionId={inspectedTxId}
        onClose={() => setInspectedTxId(null)}
      />

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <MainShell />
    </AuthProvider>
  );
}

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ToastProvider } from './components';
import { AppShell } from './layout/AppShell';
import { OverviewPage } from './pages/OverviewPage';
import { ContractsPage } from './pages/ContractsPage';
import { ContractDetailPage } from './pages/ContractDetailPage';
import { ExecutionPage } from './pages/ExecutionPage';
import { ReceiptsPage } from './pages/ReceiptsPage';
import { ReceiptDetailPage } from './pages/ReceiptDetailPage';
import { DelegationPage } from './pages/DelegationPage';
import { ViolationsPage } from './pages/ViolationsPage';
import { AgentsPage } from './pages/AgentsPage';
import { SettingsPage } from './pages/SettingsPage';

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<OverviewPage />} />
            <Route path="/contracts" element={<ContractsPage />} />
            <Route path="/contracts/:id" element={<ContractDetailPage />} />
            <Route path="/execution" element={<ExecutionPage />} />
            <Route path="/receipts" element={<ReceiptsPage />} />
            <Route path="/receipts/:id" element={<ReceiptDetailPage />} />
            <Route path="/delegation" element={<DelegationPage />} />
            <Route path="/violations" element={<ViolationsPage />} />
            <Route path="/agents" element={<AgentsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  );
}

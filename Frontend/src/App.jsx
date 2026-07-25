// src/App.jsx
import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import Sidebar from './components/layout/Sidebar';
import Topbar  from './components/layout/Topbar';
import Dashboard   from './pages/Dashboard';
import BackupPage  from './pages/BackupPage';
import {
  InventoryPage, UsersPage, SoftwarePage, ConfigPage,
  MonitorPage, PatchesPage, ServicesPage, NetworkPage,
  LogsPage, ProvisionPage, CompliancePage, DiagnosticsPage,
  AlertsPage, ReportsPage, SettingsPage,
} from './pages/DomainPages';
import './index.css';

function ElectronBridge() {
  const navigate = useNavigate();
  useEffect(() => {
    if (window.electronAPI?.onNavigate) {
      window.electronAPI.onNavigate((route) => navigate(route));
    }
  }, [navigate]);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <ElectronBridge />
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#0c0c0d' }}>
        <Sidebar />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Topbar />
          <Routes>
            <Route path="/"            element={<Dashboard />} />
            <Route path="/inventory"   element={<InventoryPage />} />
            <Route path="/users"       element={<UsersPage />} />
            <Route path="/software"    element={<SoftwarePage />} />
            <Route path="/config"      element={<ConfigPage />} />
            <Route path="/monitor"     element={<MonitorPage />} />
            <Route path="/patches"     element={<PatchesPage />} />
            <Route path="/services"    element={<ServicesPage />} />
            <Route path="/network"     element={<NetworkPage />} />
            <Route path="/backup"      element={<BackupPage />} />
            <Route path="/logs"        element={<LogsPage />} />
            <Route path="/provision"   element={<ProvisionPage />} />
            <Route path="/compliance"  element={<CompliancePage />} />
            <Route path="/diagnostics" element={<DiagnosticsPage />} />
            <Route path="/alerts"      element={<AlertsPage />} />
            <Route path="/reports"     element={<ReportsPage />} />
            <Route path="/settings"    element={<SettingsPage />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}

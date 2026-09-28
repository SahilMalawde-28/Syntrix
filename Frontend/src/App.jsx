// src/App.jsx
import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

import Sidebar from './components/layout/Sidebar';
import Topbar from './components/layout/Topbar';

import Dashboard from './pages/Dashboard';
import BackupPage from './pages/BackupPage';
import InventoryPage from './pages/InventoryPage';
import Login from './pages/Login';

import {
  UsersPage,
  SoftwarePage,
  ConfigPage,
  MonitorPage,
  PatchesPage,
  ServicesPage,
  NetworkPage,
  LogsPage,
  ProvisionPage,
  CompliancePage,
  DiagnosticsPage,
  AlertsPage,
  ReportsPage,
  SettingsPage,
} from './pages/DomainPages';

import { supabase, getProfile } from './lib/supabase';

import './index.css';

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  // -----------------------------------------
  // AUTH: Get current session + listen for changes
  // -----------------------------------------
  useEffect(() => {
    let mounted = true;

    // Get existing session when app starts
    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;

      if (error) {
        console.error('Error getting session:', error);
      }

      setSession(data?.session ?? null);
      setLoading(false);
    });

    // Listen for login/logout/session changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return;

      setSession(newSession);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // -----------------------------------------
  // AUTH: Fetch profile after session exists
  // -----------------------------------------
  useEffect(() => {
    let mounted = true;

    async function loadProfile() {
      if (!session) {
        setProfile(null);
        setProfileLoading(false);
        return;
      }

      setProfileLoading(true);

      try {
        const userProfile = await getProfile();

        if (mounted) {
          setProfile(userProfile);
        }
      } catch (error) {
        console.error('Error loading profile:', error);

        if (mounted) {
          setProfile(null);
        }
      } finally {
        if (mounted) {
          setProfileLoading(false);
        }
      }
    }

    loadProfile();

    return () => {
      mounted = false;
    };
  }, [session]);

  // -----------------------------------------
  // Initial authentication loading
  // -----------------------------------------
  if (loading) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0c0c0d',
          color: '#fff',
        }}
      >
        Loading...
      </div>
    );
  }

  // -----------------------------------------
  // Not authenticated → Login
  // -----------------------------------------
  if (!session) {
    return <Login />;
  }

  // -----------------------------------------
  // Authenticated but profile still loading
  // -----------------------------------------
  if (profileLoading || !profile) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0c0c0d',
          color: '#fff',
        }}
      >
        Loading profile...
      </div>
    );
  }

  // -----------------------------------------
  // Authenticated → Existing Application
  // -----------------------------------------
  return (
    <BrowserRouter>
      <div
        style={{
          display: 'flex',
          height: '100vh',
          overflow: 'hidden',
          background: '#0c0c0d',
        }}
      >
        <Sidebar profile={profile} />

        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <Topbar profile={profile} />

          <main
            style={{
              flex: 1,
              overflowY: 'auto',
            }}
          >
            <Routes>
              {/* Dashboard */}
              <Route
                path="/"
                element={<Dashboard profile={profile} />}
              />

              {/* Inventory */}
              <Route
                path="/inventory"
                element={<InventoryPage profile={profile} />}
              />

              {/* Users */}
              <Route
                path="/users"
                element={<UsersPage profile={profile} />}
              />

              {/* Software */}
              <Route
                path="/software"
                element={<SoftwarePage profile={profile} />}
              />

              {/* Configuration */}
              <Route
                path="/config"
                element={<ConfigPage profile={profile} />}
              />

              {/* Monitoring */}
              <Route
                path="/monitor"
                element={<MonitorPage profile={profile} />}
              />

              {/* Patches */}
              <Route
                path="/patches"
                element={<PatchesPage profile={profile} />}
              />

              {/* Services */}
              <Route
                path="/services"
                element={<ServicesPage profile={profile} />}
              />

              {/* Network */}
              <Route
                path="/network"
                element={<NetworkPage profile={profile} />}
              />

              {/* Backup */}
              <Route
                path="/backup"
                element={<BackupPage profile={profile} />}
              />

              {/* Logs */}
              <Route
                path="/logs"
                element={<LogsPage profile={profile} />}
              />

              {/* Provisioning */}
              <Route
                path="/provision"
                element={<ProvisionPage profile={profile} />}
              />

              {/* Compliance */}
              <Route
                path="/compliance"
                element={<CompliancePage profile={profile} />}
              />

              {/* Diagnostics */}
              <Route
                path="/diagnostics"
                element={<DiagnosticsPage profile={profile} />}
              />

              {/* Alerts */}
              <Route
                path="/alerts"
                element={<AlertsPage profile={profile} />}
              />

              {/* Reports */}
              <Route
                path="/reports"
                element={<ReportsPage profile={profile} />}
              />

              {/* Settings */}
              <Route
                path="/settings"
                element={<SettingsPage profile={profile} />}
              />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
}
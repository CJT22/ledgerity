import React from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ConfirmDialog, Layout, StartupGate, ToastContainer } from './components';
import { AppProvider } from './context/AppContext';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { ExpenseDetailPage } from './features/expenses/ExpenseDetailPage';
import { ExpensesListPage } from './features/expenses/ExpensesListPage';
import { ProjectionDetailPage } from './features/projections/ProjectionDetailPage';
import { ProjectionsListPage } from './features/projections/ProjectionsListPage';
import { ScenarioComparePage } from './features/projections/ScenarioComparePage';
import { SettingsPage } from './features/settings/SettingsPage';

export default function App() {
  return (
    <AppProvider>
      <HashRouter>
        <StartupGate>
        <Layout>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/expenses" element={<ExpensesListPage />} />
            <Route path="/expenses/:id" element={<ExpenseDetailPage />} />
            <Route path="/projections" element={<ProjectionsListPage />} />
            <Route path="/projections/compare" element={<ScenarioComparePage />} />
            <Route path="/projections/:id" element={<ProjectionDetailPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
        </StartupGate>
        <ToastContainer />
        <ConfirmDialog />
      </HashRouter>
    </AppProvider>
  );
}

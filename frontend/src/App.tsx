import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppShell } from './layout/AppShell';

const AuthPage = lazy(() => import('./pages/AuthPage').then((module) => ({ default: module.AuthPage })));
const Dashboard = lazy(() => import('./pages/Dashboard').then((module) => ({ default: module.Dashboard })));
const Tracking = lazy(() => import('./pages/Tracking').then((module) => ({ default: module.Tracking })));
const Vehicles = lazy(() => import('./pages/Vehicles').then((module) => ({ default: module.Vehicles })));
const Trips = lazy(() => import('./pages/Trips').then((module) => ({ default: module.Trips })));
const DriverBehaviour = lazy(() => import('./pages/Insights').then((module) => ({ default: module.DriverBehaviour })));
const AccidentDetection = lazy(() => import('./pages/Insights').then((module) => ({ default: module.AccidentDetection })));
const RouteAnomalies = lazy(() => import('./pages/Insights').then((module) => ({ default: module.RouteAnomalies })));
const Incidents = lazy(() => import('./pages/Incidents').then((module) => ({ default: module.Incidents })));
const Blockchain = lazy(() => import('./pages/Blockchain').then((module) => ({ default: module.Blockchain })));
const Transactions = lazy(() => import('./pages/Transactions').then((module) => ({ default: module.Transactions })));
const Admin = lazy(() => import('./pages/Admin').then((module) => ({ default: module.Admin })));

function ProtectedShell() {
  const { user, loading } = useAuth();
  if (loading) return <div className="app-loading"><div className="brand-mark large"><span>SR</span></div><p>Restoring operator session…</p></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <AppShell />;
}

function RouteTable() {
  const { user } = useAuth();
  return (
    <Suspense fallback={<div className="app-loading" role="status" aria-live="polite"><div className="brand-mark large"><span>SR</span></div><p>Loading SafeRoute view…</p></div>}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <AuthPage mode="login" />} />
        <Route path="/register" element={user ? <Navigate to="/" replace /> : <AuthPage mode="register" />} />
        <Route element={<ProtectedShell />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/tracking" element={<Tracking />} />
          <Route path="/vehicles" element={<Vehicles />} />
          <Route path="/trips" element={<Trips />} />
          <Route path="/driver-behaviour" element={<DriverBehaviour />} />
          <Route path="/accident-detection" element={<AccidentDetection />} />
          <Route path="/route-anomalies" element={<RouteAnomalies />} />
          <Route path="/blockchain" element={<Blockchain />} />
          <Route path="/incidents" element={<Incidents />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

export function App() {
  return <BrowserRouter><AuthProvider><RouteTable /></AuthProvider></BrowserRouter>;
}

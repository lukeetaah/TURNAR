import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { OrgProvider } from '@/contexts/OrgContext';
import { AuthGuard } from '@/components/guards/AuthGuard';
import { OrgBridge } from '@/components/guards/OrgBridge';

// Layouts
import { Layout } from '@/components/layout/Layout';
import { AppLayout } from '@/components/layout/AppLayout';

// Public pages
import { Home } from '@/pages/Home';
import { About } from '@/pages/About';
import { Plans } from '@/pages/Plans';
import { Login } from '@/pages/Login';
import { NotFound } from '@/pages/NotFound';
import { PublicBooking } from '@/pages/public/PublicBooking';
import { AcceptInvite } from '@/pages/public/AcceptInvite';

// App pages
import { SelectOrg } from '@/pages/app/SelectOrg';
import { CreateOrg } from '@/pages/app/CreateOrg';
import { Dashboard } from '@/pages/app/Dashboard';
import { Activities } from '@/pages/app/Activities';
import { Sessions } from '@/pages/app/Sessions';
import { Agenda } from '@/pages/app/Agenda';
import { Contacts } from '@/pages/app/Contacts';
import { Payments } from '@/pages/app/Payments';
import { Communications } from '@/pages/app/Communications';
import { Settings } from '@/pages/app/Settings';
import { AdminDashboard } from '@/pages/app/AdminDashboard';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <OrgProvider>
          <Routes>
            {/* Public Portal for bookings & cancellations */}
            <Route path="o/:orgSlug" element={<PublicBooking />} />

            {/* Public invitation claim route */}
            <Route path="invite/:token" element={<AcceptInvite />} />

            {/* Marketing / Public directory routes */}
            <Route path="/" element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="about" element={<About />} />
              <Route path="plans" element={<Plans />} />
              <Route path="login" element={<Login />} />
            </Route>

            {/* Authenticated Application routes */}
            <Route
              path="app"
              element={
                <AuthGuard>
                  <SelectOrg />
                </AuthGuard>
              }
            />

            <Route
              path="app/create-org"
              element={
                <AuthGuard>
                  <CreateOrg />
                </AuthGuard>
              }
            />

            {/* Platform Superadmin Dashboard */}
            <Route
              path="app/admin"
              element={
                <AuthGuard>
                  <AdminDashboard />
                </AuthGuard>
              }
            />
            <Route path="admin" element={<Navigate to="/app/admin" replace />} />

            {/* Organization scoped dashboard & modules */}
            <Route
              path="app/:orgSlug"
              element={
                <AuthGuard>
                  <OrgBridge>
                    <AppLayout />
                  </OrgBridge>
                </AuthGuard>
              }
            >
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="activities" element={<Activities />} />
              <Route path="sessions" element={<Sessions />} />
              <Route path="agenda" element={<Agenda />} />
              <Route path="contacts" element={<Contacts />} />
              <Route path="payments" element={<Payments />} />
              <Route path="communications" element={<Communications />} />
              <Route path="settings" element={<Settings />} />
            </Route>

            {/* Fallback 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </OrgProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;

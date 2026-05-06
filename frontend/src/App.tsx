import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom';
import { Activity, Users, AlertTriangle, BarChart3, Heart, Settings, Bell, LogOut, UserPlus } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import PatientList from './pages/PatientList';
import EscalationQueue from './pages/EscalationQueue';
import Analytics from './pages/Analytics';
import Login from './pages/Login';
import RegisterPatient from './pages/RegisterPatient';
import Landing from './pages/Landing';
import About from './pages/About';
import { getToken, clearToken } from './api/client';
import './App.css';

function ProtectedApp() {
  const navigate = useNavigate();

  function handleLogout() {
    clearToken();
    navigate('/login');
  }

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <Heart size={28} color="#6366f1" fill="#6366f1" />
          <div>
            <h1>NovaCare</h1>
            <span>v2.0</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <NavLink to="/dashboard" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Activity size={18} /> Dashboard
          </NavLink>
          <NavLink to="/patients" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Users size={18} /> Patients
          </NavLink>
          <NavLink to="/register-patient" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <UserPlus size={18} /> Register Patient
          </NavLink>
          <NavLink to="/escalations" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <AlertTriangle size={18} /> Escalations
            <span className="risk-badge red" style={{ marginLeft: 'auto', fontSize: '0.7rem' }}>3</span>
          </NavLink>
          <NavLink to="/analytics" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <BarChart3 size={18} /> Analytics
          </NavLink>
        </nav>

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', marginTop: 'auto' }}>
          <div className="nav-item">
            <Bell size={18} /> Notifications
          </div>
          <div className="nav-item">
            <Settings size={18} /> Settings
          </div>
          <div style={{ padding: '12px', marginTop: '8px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)' }}>
            <p style={{ fontSize: '0.8rem', fontWeight: 600 }}>Dr. Sneha Kulkarni</p>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Ruby Hall Clinic, Pune</p>
          </div>
          <button
            onClick={handleLogout}
            className="nav-item"
            style={{ color: 'var(--red)', marginTop: '8px', border: 'none', background: 'none', cursor: 'pointer', width: '100%', textAlign: 'left' }}
          >
            <LogOut size={18} /> Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <Routes>
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="patients" element={<PatientList />} />
          <Route path="register-patient" element={<RegisterPatient />} />
          <Route path="escalations" element={<EscalationQueue />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(!!getToken());

  useEffect(() => {
    // Check token on mount
    setIsAuthenticated(!!getToken());
  }, []);

  function handleLoginSuccess() {
    setIsAuthenticated(true);
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes — always accessible */}
        <Route path="/" element={<Landing />} />
        <Route path="/about" element={<About />} />
        <Route
          path="/login"
          element={
            isAuthenticated
              ? <Navigate to="/dashboard" replace />
              : <Login onLoginSuccess={handleLoginSuccess} />
          }
        />
        {/* Protected routes — require auth, wrapped in sidebar layout */}
        <Route
          path="/*"
          element={
            isAuthenticated
              ? <ProtectedApp />
              : <Navigate to="/login" replace />
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

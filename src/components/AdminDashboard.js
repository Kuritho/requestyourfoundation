import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import ManageRequests from './admin/ManageRequests';
import ManageProducts from './admin/ManageProducts';
import ManageUsers from './admin/ManageUsers';
import ManageFingerprints from './admin/ManageFingerprints';
import ManageAlarms from './admin/ManageAlarms';

const AdminDashboard = () => {
  const { signOut, isAdmin, user, userData } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeTab, setActiveTab] = useState('requests');
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [greeting, setGreeting] = useState('');
  const [fpDeviceOnline, setFpDeviceOnline] = useState(false);
  const [alarmActive, setAlarmActive] = useState(false);
  const [vibrationToday, setVibrationToday] = useState(0);
  const [stats, setStats] = useState({
    totalRequests: 0,
    pendingRequests: 0,
    totalUsers: 0,
    restrictedUsers: 0,
    totalProducts: 0,
    totalFingerprints: 0,
    totalAlarms: 0,
    totalRevenue: 0
  });

  // ============================================
  // GREETING
  // ============================================
  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good Morning');
    else if (hour < 17) setGreeting('Good Afternoon');
    else setGreeting('Good Evening');
  }, []);

  // ============================================
  // REDIRECT NON-ADMIN
  // ============================================
  useEffect(() => {
    if (user && !isAdmin) navigate('/dashboard', { replace: true });
  }, [isAdmin, user, navigate]);

  // ============================================
  // SET ACTIVE TAB
  // ============================================
  useEffect(() => {
    const path = location.pathname;
    if (path.includes('/admin/requests')) setActiveTab('requests');
    else if (path.includes('/admin/products')) setActiveTab('products');
    else if (path.includes('/admin/users')) setActiveTab('users');
    else if (path.includes('/admin/fingerprints')) setActiveTab('fingerprints');
    else if (path.includes('/admin/alarms')) setActiveTab('alarms');
    else setActiveTab('requests');
  }, [location]);

  // ============================================
  // ADMIN NOTIFICATIONS
  // ============================================
  useEffect(() => {
    if (!isAdmin) return;

    const fetchAdminNotifications = async () => {
      try {
        const { count, error } = await supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('target_role', 'admin')
          .eq('is_read', false);
        if (!error) setUnreadCount(count || 0);
      } catch (error) {
        console.error('Error fetching admin notifications:', error);
      }
    };

    fetchAdminNotifications();
  }, [isAdmin]);

  // ============================================
  // DASHBOARD STATS
  // ============================================
  useEffect(() => {
    if (!isAdmin) return;

    const fetchStats = async () => {
      try {
        const { data: requests } = await supabase.from('requests').select('status');
        const { data: users } = await supabase.from('users').select('is_restricted');
        const { data: products } = await supabase.from('products').select('is_active');
        const { data: fingerprints } = await supabase.from('fingerprints').select('id');
        const { data: alarms } = await supabase
          .from('alarm_logs')
          .select('id, resolved');

        const pendingRequests = requests?.filter(r => r.status === 'pending') || [];
        const restrictedUsers = users?.filter(u => u.is_restricted) || [];
        const activeProducts = products?.filter(p => p.is_active) || [];
        const unresolvedAlarms = alarms?.filter(a => !a.resolved) || [];

        setStats({
          totalRequests: requests?.length || 0,
          pendingRequests: pendingRequests.length,
          totalUsers: users?.length || 0,
          restrictedUsers: restrictedUsers.length,
          totalProducts: activeProducts.length,
          totalFingerprints: fingerprints?.length || 0,
          totalAlarms: unresolvedAlarms.length,
          totalRevenue: 0
        });
      } catch (error) {
        console.error('Error fetching stats:', error);
      }
    };

    fetchStats();
  }, [isAdmin]);

  // ============================================
  // FINGERPRINT DEVICE STATUS
  // ============================================
  useEffect(() => {
    if (!isAdmin) return;

    const fetchFpDevice = async () => {
      try {
        const { data, error } = await supabase
          .from('fingerprint_devices')
          .select('*');

        if (!error && data && data.length > 0) {
          const anyOnline = data.some((d) => {
            return (
              d.device_online &&
              new Date() - new Date(d.last_heartbeat) < 60000
            );
          });
          setFpDeviceOnline(anyOnline);
        } else {
          const { data: oldData } = await supabase
            .from('fingerprint_device')
            .select('*')
            .eq('id', 1)
            .single();
          if (oldData) {
            const online = oldData.device_online &&
              (new Date() - new Date(oldData.last_heartbeat)) < 60000;
            setFpDeviceOnline(online);
          }
        }
      } catch (error) {
        setFpDeviceOnline(false);
      }
    };

    fetchFpDevice();
    const interval = setInterval(fetchFpDevice, 15000);

    let channel = null;
    try {
      channel = supabase
        .channel('fp-devices-admin')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'fingerprint_devices' },
          () => fetchFpDevice()
        )
        .subscribe();
    } catch (e) {
      console.error('FP subscription error:', e);
    }

    return () => {
      clearInterval(interval);
      if (channel) supabase.removeChannel(channel);
    };
  }, [isAdmin]);

  // ============================================
  // ALARM STATUS (live)
  // ============================================
  useEffect(() => {
    if (!isAdmin) return;

    const fetchAlarmStatus = async () => {
      try {
        const { data } = await supabase
          .from('gate_status')
          .select('alarm_active, vibration_count_today, gate_open, device_online, last_heartbeat')
          .eq('id', 1)
          .single();

        if (data) {
          setAlarmActive(data.alarm_active || false);
          setVibrationToday(data.vibration_count_today || 0);
        }
      } catch (e) {
        // gate_status might not exist
      }
    };

    fetchAlarmStatus();
    const interval = setInterval(fetchAlarmStatus, 10000);

    let channel = null;
    try {
      channel = supabase
        .channel('gate-status-admin')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'gate_status' },
          (payload) => {
            if (payload.new) {
              setAlarmActive(payload.new.alarm_active || false);
              setVibrationToday(payload.new.vibration_count_today || 0);

              // If alarm just started, log to console
              if (payload.new.alarm_active) {
                console.warn('🚨 ALARM TRIGGERED!');
              }
            }
          }
        )
        .subscribe();
    } catch (e) {
      console.error('Alarm subscription error:', e);
    }

    return () => {
      clearInterval(interval);
      if (channel) supabase.removeChannel(channel);
    };
  }, [isAdmin]);

  // ============================================
  // NOTIFICATIONS REALTIME
  // ============================================
  useEffect(() => {
    if (!isAdmin) return;

    let channel = null;

    const setupSubscription = () => {
      channel = supabase
        .channel('admin-notifications')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: 'target_role=eq.admin',
          },
          (payload) => {
            setUnreadCount(prev => prev + 1);

            // If it's an alarm notification, trigger sound
            if (payload.new?.message?.includes('ALARM')) {
              try {
                const audio = new Audio(
                  'data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQBvT18AAAA='
                );
                audio.volume = 0.5;
                audio.play().catch(() => {});
              } catch (e) {}
            }
          }
        )
        .subscribe();
    };

    setupSubscription();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [isAdmin]);

  // ============================================
  // HANDLERS
  // ============================================
  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setShowMobileMenu(false);
  };

  if (!isAdmin) return null;

  return (
    <div className="admin-dashboard-container">
      {/* ============================================ */}
      {/* PROFESSIONAL ADMIN NAVBAR */}
      {/* ============================================ */}
      <nav className="navbar admin-navbar professional-navbar">
        <div className="nav-brand">
          <span className="brand-icon">👑</span>
          <span>Admin Dashboard</span>
        </div>

        <div className="nav-desktop-links">
          <Link
            to="/admin/requests"
            className={`nav-link ${activeTab === 'requests' ? 'active' : ''}`}
            onClick={() => handleTabChange('requests')}
          >
            <span className="nav-icon">📋</span>
            Requests
            {stats.pendingRequests > 0 && (
              <span className="badge">{stats.pendingRequests}</span>
            )}
          </Link>

          <Link
            to="/admin/products"
            className={`nav-link ${activeTab === 'products' ? 'active' : ''}`}
            onClick={() => handleTabChange('products')}
          >
            <span className="nav-icon">🛍️</span>
            Products
          </Link>

          <Link
            to="/admin/users"
            className={`nav-link ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => handleTabChange('users')}
          >
            <span className="nav-icon">👤</span>
            Users
          </Link>

          <Link
            to="/admin/fingerprints"
            className={`nav-link ${activeTab === 'fingerprints' ? 'active' : ''}`}
            onClick={() => handleTabChange('fingerprints')}
          >
            <span className="nav-icon">🔐</span>
            Fingerprints
            {!fpDeviceOnline && (
              <span className="badge" style={{ background: '#888' }}>?</span>
            )}
          </Link>

          <Link
            to="/admin/alarms"
            className={`nav-link ${activeTab === 'alarms' ? 'active' : ''}`}
            onClick={() => handleTabChange('alarms')}
          >
            <span className="nav-icon">🚨</span>
            Alarms
            {alarmActive && (
              <span className="badge" style={{ background: '#c62828' }}>!</span>
            )}
            {!alarmActive && stats.totalAlarms > 0 && (
              <span className="badge" style={{ background: '#b8860b' }}>
                {stats.totalAlarms}
              </span>
            )}
          </Link>

          {unreadCount > 0 && (
            <span className="badge notification-badge">{unreadCount}</span>
          )}

          <button className="nav-link logout" onClick={handleLogout}>
            <span className="nav-icon">🚪</span>
            Logout
          </button>
        </div>

        {/* Mobile Menu Toggle */}
        <button
          className="mobile-menu-toggle"
          onClick={() => setShowMobileMenu(!showMobileMenu)}
          aria-label="Toggle menu"
        >
          <span className={`hamburger ${showMobileMenu ? 'active' : ''}`}>
            <span className="line"></span>
            <span className="line"></span>
            <span className="line"></span>
          </span>
        </button>

        {/* Mobile Menu */}
        {showMobileMenu && (
          <div className="mobile-menu">
            <Link
              to="/admin/requests"
              className={`mobile-nav-link ${activeTab === 'requests' ? 'active' : ''}`}
              onClick={() => handleTabChange('requests')}
            >
              <span className="nav-icon">📋</span> Requests
              {stats.pendingRequests > 0 && (
                <span className="badge">{stats.pendingRequests}</span>
              )}
            </Link>
            <Link
              to="/admin/products"
              className={`mobile-nav-link ${activeTab === 'products' ? 'active' : ''}`}
              onClick={() => handleTabChange('products')}
            >
              <span className="nav-icon">🛍️</span> Products
            </Link>
            <Link
              to="/admin/users"
              className={`mobile-nav-link ${activeTab === 'users' ? 'active' : ''}`}
              onClick={() => handleTabChange('users')}
            >
              <span className="nav-icon">👤</span> Users
            </Link>
            <Link
              to="/admin/fingerprints"
              className={`mobile-nav-link ${activeTab === 'fingerprints' ? 'active' : ''}`}
              onClick={() => handleTabChange('fingerprints')}
            >
              <span className="nav-icon">🔐</span> Fingerprints
              {!fpDeviceOnline && (
                <span className="badge" style={{ background: '#888' }}>?</span>
              )}
            </Link>
            <Link
              to="/admin/alarms"
              className={`mobile-nav-link ${activeTab === 'alarms' ? 'active' : ''}`}
              onClick={() => handleTabChange('alarms')}
            >
              <span className="nav-icon">🚨</span> Alarms
              {alarmActive && (
                <span className="badge" style={{ background: '#c62828' }}>!</span>
              )}
            </Link>
            <button className="mobile-nav-link logout" onClick={handleLogout}>
              <span className="nav-icon">🚪</span> Logout
            </button>
          </div>
        )}
      </nav>

      <div className="admin-dashboard-content">
        {/* ============================================ */}
        {/* GLOBAL ALARM BANNER (shows on EVERY admin page) */}
        {/* ============================================ */}
        {alarmActive && (
          <div className="alarm-banner">
            <span className="alarm-icon">🚨</span>
            <div className="alarm-text">
              <strong>ALARM ACTIVE ON DEVICE</strong>
              <span>
                Vibration detected! The alarm is currently sounding on your gate.
                Click "View" to see details or resolve.
              </span>
            </div>
            <Link to="/admin/alarms" className="alarm-action-btn">
              View →
            </Link>
          </div>
        )}

        {/* ============================================ */}
        {/* WELCOME SECTION */}
        {/* ============================================ */}
        <div className="welcome-section admin-welcome">
          <div className="welcome-content">
            <div className="welcome-text">
              <h1>
                <span className="greeting">{greeting}</span>
                <span className="user-name">
                  {userData?.full_name || 'Administrator'}
                </span>
                <span className="wave-emoji">👋</span>
              </h1>
              <p className="welcome-subtitle">
                Manage your foundation lending system with ease
              </p>
            </div>
            <div className="welcome-stats">
              <div className="stat-item">
                <span className="stat-value">{stats.pendingRequests}</span>
                <span className="stat-label">Pending</span>
              </div>
              <div className="stat-divider"></div>
              <div className="stat-item">
                <span className="stat-value">{stats.totalUsers}</span>
                <span className="stat-label">Users</span>
              </div>
              <div className="stat-divider"></div>
              <div className="stat-item">
                <span className="stat-value">{stats.totalProducts}</span>
                <span className="stat-label">Products</span>
              </div>
            </div>
          </div>
        </div>

        {/* ============================================ */}
        {/* STATS GRID */}
        {/* ============================================ */}
        <div className="stats-grid admin-stats-grid">
          <div className="stat-card admin-stat-card">
            <div className="stat-icon">📋</div>
            <div className="stat-info">
              <h3>{stats.totalRequests}</h3>
              <p>Total Requests</p>
              <span className="stat-change positive">+12% this month</span>
            </div>
          </div>

          <div className="stat-card admin-stat-card pending">
            <div className="stat-icon">⏳</div>
            <div className="stat-info">
              <h3>{stats.pendingRequests}</h3>
              <p>Pending Requests</p>
              <span className="stat-change warning">Needs attention</span>
            </div>
          </div>

          <div className="stat-card admin-stat-card">
            <div className="stat-icon">👤</div>
            <div className="stat-info">
              <h3>{stats.totalUsers}</h3>
              <p>Total Users</p>
              <span className="stat-change positive">+8% this month</span>
            </div>
          </div>

          <div className="stat-card admin-stat-card restricted">
            <div className="stat-icon">🔒</div>
            <div className="stat-info">
              <h3>{stats.restrictedUsers}</h3>
              <p>Restricted Users</p>
              <span className="stat-change danger">Action required</span>
            </div>
          </div>

          <div className="stat-card admin-stat-card">
            <div className="stat-icon">🛍️</div>
            <div className="stat-info">
              <h3>{stats.totalProducts}</h3>
              <p>Active Products</p>
              <span className="stat-change positive">All available</span>
            </div>
          </div>

          <div className={`stat-card admin-stat-card ${fpDeviceOnline ? '' : 'restricted'}`}>
            <div className="stat-icon">🔐</div>
            <div className="stat-info">
              <h3>{stats.totalFingerprints}</h3>
              <p>Fingerprints</p>
              <span className={`stat-change ${fpDeviceOnline ? 'positive' : 'danger'}`}>
                {fpDeviceOnline ? 'Device online' : 'Device offline'}
              </span>
            </div>
          </div>

          <div className={`stat-card admin-stat-card ${alarmActive ? 'restricted' : ''}`}>
            <div className="stat-icon">{alarmActive ? '🚨' : '🔕'}</div>
            <div className="stat-info">
              <h3>{vibrationToday}</h3>
              <p>Vibrations Today</p>
              <span className={`stat-change ${alarmActive ? 'danger' : 'positive'}`}>
                {alarmActive ? 'ALARM ACTIVE!' : 'All quiet'}
              </span>
            </div>
          </div>
        </div>

        {/* ============================================ */}
        {/* QUICK ACTIONS */}
        {/* ============================================ */}
        <div className="quick-actions admin-quick-actions">
          <h3>⚡ Quick Actions</h3>
          <div className="action-grid">
            <Link to="/admin/requests" className="quick-action-btn">
              <span className="action-icon">📋</span>
              <span className="action-text">Review Pending Requests</span>
              {stats.pendingRequests > 0 && (
                <span className="badge">{stats.pendingRequests}</span>
              )}
            </Link>
            <Link to="/admin/products" className="quick-action-btn">
              <span className="action-icon">✨</span>
              <span className="action-text">Add New Product</span>
            </Link>
            <Link to="/admin/users" className="quick-action-btn">
              <span className="action-icon">👤</span>
              <span className="action-text">Manage Users</span>
            </Link>
            <Link to="/admin/fingerprints" className="quick-action-btn">
              <span className="action-icon">🔐</span>
              <span className="action-text">Fingerprint Management</span>
              {!fpDeviceOnline && (
                <span className="badge" style={{ background: '#888' }}>?</span>
              )}
            </Link>
            <Link to="/admin/alarms" className="quick-action-btn">
              <span className="action-icon">🚨</span>
              <span className="action-text">Alarm System</span>
              {alarmActive && (
                <span className="badge" style={{ background: '#c62828' }}>!</span>
              )}
              {!alarmActive && stats.totalAlarms > 0 && (
                <span className="badge" style={{ background: '#b8860b' }}>
                  {stats.totalAlarms}
                </span>
              )}
            </Link>
          </div>
        </div>

        {/* ============================================ */}
        {/* CONTENT AREA — Nested Routes */}
        {/* ============================================ */}
        <div className="admin-tab-content">
          <Routes>
            <Route
              path="/"
              element={
                <AdminHome
                  stats={stats}
                  fpDeviceOnline={fpDeviceOnline}
                  alarmActive={alarmActive}
                  vibrationToday={vibrationToday}
                />
              }
            />
            <Route path="/requests" element={<ManageRequests />} />
            <Route path="/products" element={<ManageProducts />} />
            <Route path="/users" element={<ManageUsers />} />
            <Route path="/fingerprints" element={<ManageFingerprints />} />
            <Route path="/alarms" element={<ManageAlarms />} />
          </Routes>
        </div>
      </div>
    </div>
  );
};

// ============================================
// ADMIN HOME COMPONENT
// ============================================
const AdminHome = ({ stats, fpDeviceOnline, alarmActive, vibrationToday }) => {
  const { userData } = useAuth();

  return (
    <div className="admin-home-content">
      <div className="admin-home-grid">
        <div className="admin-welcome-card">
          <h3>📊 Dashboard Overview</h3>
          <p>
            Welcome to your admin dashboard. Here's what's happening with your
            lending system.
          </p>

          <div className="activity-list">
            <div className="activity-item">
              <span className="activity-icon">📋</span>
              <div className="activity-info">
                <strong>{stats.pendingRequests}</strong>
                <span>Pending requests waiting for review</span>
              </div>
            </div>
            <div className="activity-item">
              <span className="activity-icon">👤</span>
              <div className="activity-info">
                <strong>{stats.restrictedUsers}</strong>
                <span>Users with restricted accounts</span>
              </div>
            </div>
            <div className="activity-item">
              <span className="activity-icon">🛍️</span>
              <div className="activity-info">
                <strong>{stats.totalProducts}</strong>
                <span>Active products available</span>
              </div>
            </div>
            <div className="activity-item">
              <span className="activity-icon">📊</span>
              <div className="activity-info">
                <strong>{stats.totalUsers}</strong>
                <span>Total registered users</span>
              </div>
            </div>
            <div className="activity-item">
              <span className="activity-icon">
                {fpDeviceOnline ? '🟢' : '🔴'}
              </span>
              <div className="activity-info">
                <strong>{stats.totalFingerprints}</strong>
                <span>
                  Fingerprints ·{' '}
                  {fpDeviceOnline ? 'Device online' : 'Device offline'}
                </span>
              </div>
            </div>
            <div
              className="activity-item"
              style={
                alarmActive
                  ? { background: '#fdf2f2', borderLeft: '3px solid #c62828' }
                  : {}
              }
            >
              <span className="activity-icon">{alarmActive ? '🚨' : '🔕'}</span>
              <div className="activity-info">
                <strong>{vibrationToday}</strong>
                <span>
                  Vibrations today ·{' '}
                  {alarmActive ? (
                    <strong style={{ color: '#c62828' }}>ALARM ACTIVE!</strong>
                  ) : (
                    'All quiet'
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="admin-tips-card">
          <h3>💡 Admin Tips</h3>
          <ul className="tips-list">
            <li>
              <span className="tip-icon">✅</span>
              <span>Regularly review pending requests to keep users happy</span>
            </li>
            <li>
              <span className="tip-icon">🔄</span>
              <span>Update product inventory to reflect current stock</span>
            </li>
            <li>
              <span className="tip-icon">🔒</span>
              <span>Manage restricted users and resolve issues promptly</span>
            </li>
            <li>
              <span className="tip-icon">🔐</span>
              <span>Rename fingerprint IDs to match real user names</span>
            </li>
            <li>
              <span className="tip-icon">🚨</span>
              <span>Check alarm logs daily for suspicious gate activity</span>
            </li>
            <li>
              <span className="tip-icon">📱</span>
              <span>Check notifications for real-time updates</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;

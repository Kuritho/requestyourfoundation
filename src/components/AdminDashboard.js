import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import ManageRequests from './admin/ManageRequests';
import ManageProducts from './admin/ManageProducts';
import ManageUsers from './admin/ManageUsers';
import ManageFingerprints from './admin/ManageFingerprints';

const AdminDashboard = () => {
  const { signOut, isAdmin, user, userData } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeTab, setActiveTab] = useState('requests');
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [greeting, setGreeting] = useState('');
  const [fpDeviceOnline, setFpDeviceOnline] = useState(false);
  const [stats, setStats] = useState({
    totalRequests: 0,
    pendingRequests: 0,
    totalUsers: 0,
    restrictedUsers: 0,
    totalProducts: 0,
    totalFingerprints: 0,
    totalRevenue: 0
  });

  // Greeting
  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good Morning');
    else if (hour < 17) setGreeting('Good Afternoon');
    else setGreeting('Good Evening');
  }, []);

  // Redirect non-admin
  useEffect(() => {
    if (user && !isAdmin) navigate('/dashboard', { replace: true });
  }, [isAdmin, user, navigate]);

  // Set active tab
  useEffect(() => {
    const path = location.pathname;
    if (path.includes('/admin/requests')) setActiveTab('requests');
    else if (path.includes('/admin/products')) setActiveTab('products');
    else if (path.includes('/admin/users')) setActiveTab('users');
    else if (path.includes('/admin/fingerprints')) setActiveTab('fingerprints');
    else setActiveTab('requests');
  }, [location]);

  // Admin notifications
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

  // Dashboard stats
  useEffect(() => {
    if (!isAdmin) return;

    const fetchStats = async () => {
      try {
        const { data: requests } = await supabase.from('requests').select('status');
        const { data: users } = await supabase.from('users').select('is_restricted');
        const { data: products } = await supabase.from('products').select('is_active');
        const { data: fingerprints } = await supabase.from('fingerprints').select('id');

        const pendingRequests = requests?.filter(r => r.status === 'pending') || [];
        const restrictedUsers = users?.filter(u => u.is_restricted) || [];
        const activeProducts = products?.filter(p => p.is_active) || [];

        setStats({
          totalRequests: requests?.length || 0,
          pendingRequests: pendingRequests.length,
          totalUsers: users?.length || 0,
          restrictedUsers: restrictedUsers.length,
          totalProducts: activeProducts.length,
          totalFingerprints: fingerprints?.length || 0,
          totalRevenue: 0
        });
      } catch (error) {
        console.error('Error fetching stats:', error);
      }
    };

    fetchStats();
  }, [isAdmin]);

  // Fingerprint device status
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
          // Fallback to old table
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

  // Notifications realtime
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
          () => setUnreadCount(prev => prev + 1)
        )
        .subscribe();
    };

    setupSubscription();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [isAdmin]);

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

          {unreadCount > 0 && (
            <span className="badge notification-badge">{unreadCount}</span>
          )}

          <button className="nav-link logout" onClick={handleLogout}>
            <span className="nav-icon">🚪</span>
            Logout
          </button>
        </div>

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
            <button className="mobile-nav-link logout" onClick={handleLogout}>
              <span className="nav-icon">🚪</span> Logout
            </button>
          </div>
        )}
      </nav>

      <div className="admin-dashboard-content">
        <div className="welcome-section admin-welcome">
          <div className="welcome-content">
            <div className="welcome-text">
              <h1>
                <span className="greeting">{greeting}</span>
                <span className="user-name">{userData?.full_name || 'Administrator'}</span>
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
        </div>

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
          </div>
        </div>

        <div className="admin-tab-content">
          <Routes>
            <Route
              path="/"
              element={
                <AdminHome stats={stats} fpDeviceOnline={fpDeviceOnline} />
              }
            />
            <Route path="/requests" element={<ManageRequests />} />
            <Route path="/products" element={<ManageProducts />} />
            <Route path="/users" element={<ManageUsers />} />
            <Route path="/fingerprints" element={<ManageFingerprints />} />
          </Routes>
        </div>
      </div>
    </div>
  );
};

const AdminHome = ({ stats, fpDeviceOnline }) => {
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

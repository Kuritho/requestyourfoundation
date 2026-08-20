import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';
import Products from './Products';
import MyRequests from './MyRequests';
import Notifications from './Notifications';
import Profile from './Profile';

const UserDashboard = () => {
  const { user, userData, signOut, isRestricted, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('products');
  const [unreadCount, setUnreadCount] = useState(0);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [greeting, setGreeting] = useState('');

  // Redirect to admin dashboard if user is admin
  useEffect(() => {
    if (isAdmin) {
      navigate('/admin', { replace: true });
    }
  }, [isAdmin, navigate]);

  // Set greeting based on time of day
  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good Morning');
    else if (hour < 17) setGreeting('Good Afternoon');
    else setGreeting('Good Evening');
  }, []);

  // Fetch unread notifications count
  useEffect(() => {
    const fetchUnreadCount = async () => {
      if (!user?.id || isAdmin) return;
      
      try {
        const { count, error } = await supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('is_read', false);

        if (!error) {
          setUnreadCount(count || 0);
        }
      } catch (error) {
        console.error('Error fetching unread count:', error);
      }
    };

    fetchUnreadCount();
  }, [user?.id, isAdmin]);

  // Set up realtime subscription for notifications
  useEffect(() => {
    if (!user?.id || isAdmin) return;

    let channel = null;

    const setupSubscription = () => {
      channel = supabase
        .channel(`notifications-${user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            setUnreadCount(prev => prev + 1);
          }
        )
        .subscribe((status) => {
          console.log('Notification subscription status:', status);
        });
    };

    setupSubscription();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [user?.id, isAdmin]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setShowMobileMenu(false);
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  // If admin, don't render user dashboard
  if (isAdmin) {
    return null;
  }

  return (
    <div className="dashboard-container">
      {/* Professional Navbar */}
      <nav className="navbar professional-navbar">
        <div className="nav-brand">
          <span className="brand-icon">💄</span>
          <span>CosmoLend</span>
        </div>
        
        <div className="nav-desktop-links">
          <button 
            className={`nav-link ${activeTab === 'products' ? 'active' : ''}`}
            onClick={() => handleTabChange('products')}
          >
            <span className="nav-icon">🛍️</span>
            Browse
          </button>
          <button 
            className={`nav-link ${activeTab === 'requests' ? 'active' : ''}`}
            onClick={() => handleTabChange('requests')}
          >
            <span className="nav-icon">📋</span>
            My Requests
          </button>
          <button 
            className={`nav-link ${activeTab === 'notifications' ? 'active' : ''}`}
            onClick={() => handleTabChange('notifications')}
          >
            <span className="nav-icon">🔔</span>
            Notifications
            {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
          </button>
          <button 
            className={`nav-link ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => handleTabChange('profile')}
          >
            <span className="nav-icon">👤</span>
            Profile
          </button>
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
            <button 
              className={`mobile-nav-link ${activeTab === 'products' ? 'active' : ''}`}
              onClick={() => handleTabChange('products')}
            >
              <span className="nav-icon">🛍️</span> Browse
            </button>
            <button 
              className={`mobile-nav-link ${activeTab === 'requests' ? 'active' : ''}`}
              onClick={() => handleTabChange('requests')}
            >
              <span className="nav-icon">📋</span> My Requests
            </button>
            <button 
              className={`mobile-nav-link ${activeTab === 'notifications' ? 'active' : ''}`}
              onClick={() => handleTabChange('notifications')}
            >
              <span className="nav-icon">🔔</span> Notifications
              {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
            </button>
            <button 
              className={`mobile-nav-link ${activeTab === 'profile' ? 'active' : ''}`}
              onClick={() => handleTabChange('profile')}
            >
              <span className="nav-icon">👤</span> Profile
            </button>
            <button className="mobile-nav-link logout" onClick={handleLogout}>
              <span className="nav-icon">🚪</span> Logout
            </button>
          </div>
        )}
      </nav>

      <div className="dashboard-content">
        {/* Welcome Section */}
        <div className="welcome-section">
          <div className="welcome-content">
            <div className="welcome-text">
              <h1>
                <span className="greeting">{greeting}</span>
                <span className="user-name">{userData?.full_name || 'Beauty'}</span>
                <span className="wave-emoji">👋</span>
              </h1>
              <p className="welcome-subtitle">
                Explore our curated collection of foundation products and make your request
              </p>
            </div>
            <div className="welcome-stats">
              <div className="stat-item">
                <span className="stat-value">{unreadCount}</span>
                <span className="stat-label">Notifications</span>
              </div>
              <div className="stat-divider"></div>
              <div className="stat-item">
                <span className="stat-value">✨</span>
                <span className="stat-label">Member</span>
              </div>
            </div>
          </div>
        </div>

        {/* Restriction Banner */}
        {isRestricted && (
          <div className="restriction-banner">
            <div className="restriction-icon">🔒</div>
            <div className="restriction-content">
              <h3>Account Restricted</h3>
              <p>{userData?.restriction_reason || 'Your account has been restricted. Please contact an administrator.'}</p>
            </div>
          </div>
        )}

        {/* Tab Content */}
        <div className="tab-content">
          {activeTab === 'products' && <Products />}
          {activeTab === 'requests' && <MyRequests />}
          {activeTab === 'notifications' && <Notifications />}
          {activeTab === 'profile' && <Profile />}
        </div>
      </div>
    </div>
  );
};

export default UserDashboard;

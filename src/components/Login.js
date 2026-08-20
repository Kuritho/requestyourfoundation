import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasAdmin, setHasAdmin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const checkAdminExists = async () => {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('id')
          .eq('role', 'admin')
          .limit(1);
        
        if (error) throw error;
        setHasAdmin(data && data.length > 0);
      } catch (error) {
        console.error('Error checking admin:', error);
        setHasAdmin(true);
      }
    };
    
    checkAdminExists();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!username.trim() || !password.trim()) {
      setError('Please enter both username and password');
      setLoading(false);
      return;
    }

    const result = await signIn(username.trim(), password);
    
    if (result.success) {
      const { data: userData } = await supabase
        .from('users')
        .select('role')
        .eq('username', username.trim())
        .single();
      
      if (userData?.role === 'admin') {
        navigate('/admin');
      } else {
        navigate('/dashboard');
      }
    } else {
      setError(result.error || 'Login failed. Please try again.');
    }
    setLoading(false);
  };

  return (
    <div className="auth-container">
      {/* Decorative Background Elements */}
      <div className="auth-bg-elements">
        <div className="bg-circle bg-circle-1"></div>
        <div className="bg-circle bg-circle-2"></div>
        <div className="bg-circle bg-circle-3"></div>
        <div className="bg-circle bg-circle-4"></div>
        <div className="bg-blur bg-blur-1"></div>
        <div className="bg-blur bg-blur-2"></div>
      </div>

      <div className="auth-card login-card">
        {/* Brand Header */}
        <div className="auth-header">
          <div className="brand-icon-wrapper">
            <span className="brand-icon">💄</span>
          </div>
          <h1 className="brand-title">CosmoLend</h1>
          <p className="brand-subtitle">Welcome back to your beauty destination</p>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="auth-error">
            <span className="error-icon">✕</span>
            <span className="error-text">{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="username">
              <span className="label-icon">👤</span>
              Username
            </label>
            <div className="input-wrapper">
              <input
                type="text"
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                required
                autoFocus
                className="auth-input"
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="password">
              <span className="label-icon">🔑</span>
              Password
            </label>
            <div className="input-wrapper password-wrapper">
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                className="auth-input"
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
          </div>

          <button type="submit" disabled={loading} className="auth-submit-btn">
            {loading ? (
              <>
                <span className="spinner"></span>
                Signing in...
              </>
            ) : (
              <>
                <span className="btn-icon">✨</span>
                Sign In
              </>
            )}
          </button>
        </form>

        {/* Admin Setup Notice */}
        {!hasAdmin && (
          <div className="">
            <span className="notice-icon"></span>
            <span className="notice-text">
              {/* No admin account exists. <Link to="/admin-setup">Create admin account</Link> */}
            </span>
          </div>
        )}

        {/* Footer Links */}
        <div className="auth-footer-links">
          <p className="auth-link">
            Don't have an account? <Link to="/signup">Sign up</Link>
          </p>
          <Link to="/terms" className="terms-link">
            <span className="terms-icon">📋</span>
            Terms & Conditions
          </Link>
        </div>

        {/* Developer Credit */}
        <div className="auth-developer-credit">
          <span className=""></span>
          <span className="credit-text">
            System developed by <span className="dev-name">Jannah & Arvy</span>
          </span>
          <span className=""></span>
        </div>
      </div>
    </div>
  );
};

export default Login;

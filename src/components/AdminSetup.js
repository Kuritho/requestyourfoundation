import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';

const AdminSetup = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  const handleCreateAdmin = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (!username || !password || !fullName) {
        throw new Error('All fields are required');
      }

      if (password.length < 6) {
        throw new Error('Password must be at least 6 characters');
      }

      const { data: existingAdmins, error: checkError } = await supabase
        .from('users')
        .select('id')
        .eq('role', 'admin')
        .limit(1);

      if (checkError) throw checkError;

      if (existingAdmins && existingAdmins.length > 0) {
        throw new Error('An admin account already exists. Please login as admin.');
      }

      const email = `${username}@internal.local`;
      
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username,
            full_name: fullName,
          },
        }
      });

      if (authError) throw authError;

      if (!authData.user) {
        throw new Error('Failed to create user');
      }

      const { error: userError } = await supabase
        .from('users')
        .insert([
          {
            id: authData.user.id,
            username: username,
            full_name: fullName,
            role: 'admin',
            accepted_terms_at: new Date().toISOString(),
          }
        ]);

      if (userError) {
        if (userError.code === '23505') {
          const { error: updateError } = await supabase
            .from('users')
            .update({ 
              role: 'admin',
              full_name: fullName,
              accepted_terms_at: new Date().toISOString()
            })
            .eq('username', username);
          
          if (updateError) throw updateError;
        } else {
          throw userError;
        }
      }

      setSuccess('✅ Admin account created successfully! Redirecting...');

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (!signInError) {
        setTimeout(() => {
          navigate('/admin');
        }, 2000);
      } else {
        setTimeout(() => {
          navigate('/login');
        }, 2000);
      }

    } catch (error) {
      console.error('Error creating admin:', error);
      setError(error.message || 'Failed to create admin account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-bg-elements">
        <div className="bg-circle bg-circle-1"></div>
        <div className="bg-circle bg-circle-2"></div>
        <div className="bg-circle bg-circle-3"></div>
        <div className="bg-circle bg-circle-4"></div>
        <div className="bg-blur bg-blur-1"></div>
        <div className="bg-blur bg-blur-2"></div>
      </div>

      <div className="auth-card admin-setup-card">
        <div className="auth-header">
          <div className="brand-icon-wrapper">
            <span className="brand-icon">👑</span>
          </div>
          <h1 className="brand-title">Admin Setup</h1>
          <p className="brand-subtitle">Create the first administrator account</p>
        </div>

        {error && (
          <div className="auth-error">
            <span className="error-icon">✕</span>
            <span className="error-text">{error}</span>
          </div>
        )}
        {success && (
          <div className="auth-success">
            <span className="success-icon">✓</span>
            <span className="success-text">{success}</span>
          </div>
        )}

        <form onSubmit={handleCreateAdmin} className="auth-form">
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
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ''))}
                placeholder="admin"
                required
                autoFocus
                className="auth-input"
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="fullName">
              <span className="label-icon">📝</span>
              Full Name
            </label>
            <div className="input-wrapper">
              <input
                type="text"
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="System Administrator"
                required
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
                placeholder="Minimum 6 characters"
                required
                minLength="6"
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
            <small className="form-hint">Password must be at least 6 characters</small>
          </div>

          <button type="submit" disabled={loading} className="auth-submit-btn">
            {loading ? (
              <>
                <span className="spinner"></span>
                Creating Admin...
              </>
            ) : (
              <>
                <span className="btn-icon">👑</span>
                Create Admin Account
              </>
            )}
          </button>
        </form>

        <div className="auth-footer-links">
          <p className="auth-link">
            Already have an account? <Link to="/login">Login</Link>
          </p>
        </div>

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

export default AdminSetup;
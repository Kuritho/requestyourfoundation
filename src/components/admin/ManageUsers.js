import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';

const ManageUsers = () => {
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});
  const [selectedUser, setSelectedUser] = useState(null);
  const [restrictModal, setRestrictModal] = useState(null);
  const [restrictReason, setRestrictReason] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showLogs, setShowLogs] = useState(false);
  const { user, userData } = useAuth();

  // ============================================
  // FETCH USERS
  // ============================================
  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // FETCH RESTRICTION LOGS
  // ============================================
  const fetchLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('restriction_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      console.error('Error fetching logs:', error);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchLogs();

    // Realtime: refresh users when changed
    const userChannel = supabase
      .channel('users-admin')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'users' },
        () => fetchUsers()
      )
      .subscribe();

    const logChannel = supabase
      .channel('restriction-logs-admin')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'restriction_logs' },
        (payload) => {
          setLogs((prev) => [payload.new, ...prev].slice(0, 50));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(userChannel);
      supabase.removeChannel(logChannel);
    };
  }, []);

  // ============================================
  // UNRESTRICT USER
  // ============================================
  const handleUnrestrict = async (targetUser) => {
    if (
      !window.confirm(
        `Unrestrict "${targetUser.full_name}" (${targetUser.username})?\n\n` +
          `They will be able to submit new requests again.`
      )
    )
      return;

    setActionLoading((prev) => ({ ...prev, [targetUser.id]: true }));
    setError('');
    setSuccess('');

    try {
      // 1. Update user record
      const { error: updateError } = await supabase
        .from('users')
        .update({
          is_restricted: false,
          restriction_reason: null,
        })
        .eq('id', targetUser.id);

      if (updateError) throw updateError;

      // 2. Insert audit log
      await supabase.from('restriction_logs').insert([
        {
          user_id: targetUser.id,
          user_name: targetUser.full_name,
          action: 'UNRESTRICTED',
          reason: targetUser.restriction_reason || 'No reason recorded',
          performed_by: user?.id,
          performed_by_name: userData?.full_name || 'Admin',
        },
      ]);

      // 3. Send notification to user
      await supabase.from('notifications').insert([
        {
          user_id: targetUser.id,
          type: 'account_unrestricted',
          message:
            '✅ Your account has been unrestricted. You can now submit new requests.',
        },
      ]);

      setSuccess(`✅ ${targetUser.full_name} has been unrestricted.`);
      fetchUsers();
      fetchLogs();
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      console.error('Error unrestricting user:', error);
      setError(`Failed to unrestrict: ${error.message}`);
      setTimeout(() => setError(''), 3000);
    } finally {
      setActionLoading((prev) => ({ ...prev, [targetUser.id]: false }));
    }
  };

  // ============================================
  // RESTRICT USER (Manual)
  // ============================================
  const handleRestrict = async () => {
    if (!restrictModal) return;
    if (!restrictReason.trim()) {
      setError('Please provide a reason');
      return;
    }

    const targetUser = restrictModal;
    setActionLoading((prev) => ({ ...prev, [targetUser.id]: true }));
    setError('');

    try {
      // 1. Update user record
      const { error: updateError } = await supabase
        .from('users')
        .update({
          is_restricted: true,
          restriction_reason: restrictReason.trim(),
        })
        .eq('id', targetUser.id);

      if (updateError) throw updateError;

      // 2. Insert audit log
      await supabase.from('restriction_logs').insert([
        {
          user_id: targetUser.id,
          user_name: targetUser.full_name,
          action: 'RESTRICTED',
          reason: restrictReason.trim(),
          performed_by: user?.id,
          performed_by_name: userData?.full_name || 'Admin',
        },
      ]);

      // 3. Send notification
      await supabase.from('notifications').insert([
        {
          user_id: targetUser.id,
          type: 'account_restricted',
          message: `🔒 Your account has been restricted. Reason: ${restrictReason.trim()}`,
        },
      ]);

      setSuccess(`🔒 ${targetUser.full_name} has been restricted.`);
      setRestrictModal(null);
      setRestrictReason('');
      fetchUsers();
      fetchLogs();
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      console.error('Error restricting user:', error);
      setError(`Failed to restrict: ${error.message}`);
    } finally {
      setActionLoading((prev) => ({ ...prev, [targetUser.id]: false }));
    }
  };

  // ============================================
  // HELPERS
  // ============================================
  const getRoleBadge = (role) => {
    return `role-badge ${role === 'admin' ? 'badge-admin' : 'badge-user'}`;
  };

  const restrictedCount = users.filter((u) => u.is_restricted).length;

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading users...</p>
      </div>
    );
  }

  return (
    <div className="admin-users">
      {/* Header */}
      <div className="admin-header">
        <h2>👤 Manage Users</h2>
        <div className="request-stats">
          <span className="stat-badge">Total: {users.length}</span>
          <span className="stat-badge" style={{ background: '#fdf2f2', color: '#c62828' }}>
            Restricted: {restrictedCount}
          </span>
          <button
            className="stat-badge"
            style={{ cursor: 'pointer', border: 'none' }}
            onClick={() => setShowLogs(!showLogs)}
          >
            {showLogs ? '📋 Hide Logs' : '📋 Show Logs'}
          </button>
        </div>
      </div>

      {error && <div className="error-message">❌ {error}</div>}
      {success && <div className="success-message">✅ {success}</div>}

      {/* Users table */}
      <div className="users-table-container">
        <table className="users-table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Full Name</th>
              <th>Role</th>
              <th>Status</th>
              <th>Joined</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>@{u.username}</td>
                <td>{u.full_name}</td>
                <td>
                  <span className={getRoleBadge(u.role)}>{u.role}</span>
                </td>
                <td>
                  {u.is_restricted ? (
                    <span className="status-restricted">🔒 Restricted</span>
                  ) : (
                    <span className="status-active">✅ Active</span>
                  )}
                  {u.is_restricted && u.restriction_reason && (
                    <div className="restriction-reason-tooltip">
                      <small>Reason: {u.restriction_reason}</small>
                    </div>
                  )}
                </td>
                <td>{new Date(u.created_at).toLocaleDateString()}</td>
                <td>
                  <div className="action-buttons">
                    <div className="action-row">
                      {u.is_restricted ? (
                        <button
                          className="btn-unrestrict"
                          onClick={() => handleUnrestrict(u)}
                          disabled={actionLoading[u.id]}
                        >
                          {actionLoading[u.id] ? '⏳' : '🔓 Unrestrict'}
                        </button>
                      ) : (
                        <button
                          className="btn-restrict"
                          onClick={() => {
                            setRestrictModal(u);
                            setRestrictReason('');
                          }}
                          disabled={actionLoading[u.id]}
                        >
                          {actionLoading[u.id] ? '⏳' : '🔒 Restrict'}
                        </button>
                      )}
                      <button
                        className="btn-view-details"
                        onClick={() => setSelectedUser(u)}
                      >
                        👁️ Details
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Restriction Logs */}
      {showLogs && (
        <div className="restriction-logs-section">
          <h3>📋 Recent Restriction Activity</h3>
          {logs.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--medium-gray)', padding: '20px' }}>
              No activity yet
            </p>
          ) : (
            <table className="requests-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Reason</th>
                  <th>By</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td>
                      <div className="date-info">
                        <div className="date-main">
                          {new Date(log.created_at).toLocaleDateString()}
                        </div>
                        <div className="date-time">
                          {new Date(log.created_at).toLocaleTimeString()}
                        </div>
                      </div>
                    </td>
                    <td>
                      <strong>{log.user_name}</strong>
                    </td>
                    <td>
                      <span
                        className={`event-badge ${
                          log.action === 'RESTRICTED'
                            ? 'event-alarm_triggered'
                            : 'event-access_granted'
                        }`}
                      >
                        {log.action === 'RESTRICTED' ? '🔒' : '🔓'} {log.action}
                      </span>
                    </td>
                    <td>{log.reason || '—'}</td>
                    <td>
                      <small>{log.performed_by_name || 'System'}</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* User Details Modal */}
      {selectedUser && (
        <div className="modal-overlay">
          <div className="modal-content user-details-modal">
            <h3>User Details</h3>
            <div className="user-details-grid">
              <div>
                <label>Username</label>
                <p>@{selectedUser.username}</p>
              </div>
              <div>
                <label>Full Name</label>
                <p>{selectedUser.full_name}</p>
              </div>
              <div>
                <label>Role</label>
                <p>{selectedUser.role}</p>
              </div>
              <div>
                <label>Status</label>
                <p>{selectedUser.is_restricted ? 'Restricted' : 'Active'}</p>
              </div>
              <div>
                <label>Restriction Reason</label>
                <p>{selectedUser.restriction_reason || 'N/A'}</p>
              </div>
              <div>
                <label>Terms Accepted</label>
                <p>
                  {selectedUser.accepted_terms_at
                    ? new Date(selectedUser.accepted_terms_at).toLocaleString()
                    : 'Not accepted'}
                </p>
              </div>
              <div>
                <label>Member Since</label>
                <p>{new Date(selectedUser.created_at).toLocaleString()}</p>
              </div>
              {selectedUser.id_document_url && (
                <div>
                  <label>ID Document</label>
                  <a
                    href={selectedUser.id_document_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="view-id-link"
                  >
                    View ID Document
                  </a>
                </div>
              )}
            </div>
            <div className="modal-actions">
              {selectedUser.is_restricted ? (
                <button
                  className="btn-unrestrict"
                  onClick={() => {
                    handleUnrestrict(selectedUser);
                    setSelectedUser(null);
                  }}
                >
                  🔓 Unrestrict
                </button>
              ) : (
                <button
                  className="btn-restrict"
                  onClick={() => {
                    setRestrictModal(selectedUser);
                    setRestrictReason('');
                    setSelectedUser(null);
                  }}
                >
                  🔒 Restrict
                </button>
              )}
              <button onClick={() => setSelectedUser(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Restrict Reason Modal */}
      {restrictModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>🔒 Restrict User</h3>
            <p style={{ color: 'var(--secondary-light)', marginBottom: '16px' }}>
              Restricting <strong>{restrictModal.full_name}</strong> (
              {restrictModal.username}) will prevent them from submitting new
              requests.
            </p>

            <div className="form-group">
              <label>Reason for restriction *</label>
              <textarea
                value={restrictReason}
                onChange={(e) => setRestrictReason(e.target.value)}
                placeholder="e.g., Failed to return item on time, Damaged product, etc."
                rows="3"
                autoFocus
              />
              <small className="form-hint">
                This reason will be visible to the user and stored in the audit log.
              </small>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                onClick={() => {
                  setRestrictModal(null);
                  setRestrictReason('');
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-restrict"
                onClick={handleRestrict}
                disabled={actionLoading[restrictModal.id]}
              >
                {actionLoading[restrictModal.id] ? '⏳' : '🔒 Restrict User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageUsers;

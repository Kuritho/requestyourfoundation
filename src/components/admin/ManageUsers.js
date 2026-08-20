import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';

const ManageUsers = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});
  const [selectedUser, setSelectedUser] = useState(null);

  useEffect(() => {
    fetchUsers();
  }, []);

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

  const handleUnrestrict = async (userId) => {
    setActionLoading(prev => ({ ...prev, [userId]: true }));
    
    try {
      const { error } = await supabase
        .from('users')
        .update({
          is_restricted: false,
          restriction_reason: null,
        })
        .eq('id', userId);

      if (error) throw error;

      // Notify user
      await supabase
        .from('notifications')
        .insert([
          {
            user_id: userId,
            type: 'account_unrestricted',
            message: 'Your account has been unrestricted. You can now submit new requests.',
          }
        ]);

      fetchUsers();
    } catch (error) {
      console.error('Error unrestricting user:', error);
    } finally {
      setActionLoading(prev => ({ ...prev, [userId]: false }));
    }
  };

  const getRoleBadge = (role) => {
    return `role-badge ${role === 'admin' ? 'badge-admin' : 'badge-user'}`;
  };

  if (loading) {
    return <div className="loading">Loading users...</div>;
  }

  return (
    <div className="admin-users">
      <h2>Manage Users</h2>

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
            {users.map((user) => (
              <tr key={user.id}>
                <td>@{user.username}</td>
                <td>{user.full_name}</td>
                <td>
                  <span className={getRoleBadge(user.role)}>
                    {user.role}
                  </span>
                </td>
                <td>
                  {user.is_restricted ? (
                    <span className="status-restricted">🔒 Restricted</span>
                  ) : (
                    <span className="status-active">✅ Active</span>
                  )}
                  {user.is_restricted && user.restriction_reason && (
                    <div className="restriction-reason-tooltip">
                      <small>Reason: {user.restriction_reason}</small>
                    </div>
                  )}
                </td>
                <td>{new Date(user.created_at).toLocaleDateString()}</td>
                <td>
                  {user.is_restricted && (
                    <button
                      className="btn-unrestrict"
                      onClick={() => handleUnrestrict(user.id)}
                      disabled={actionLoading[user.id]}
                    >
                      {actionLoading[user.id] ? 'Processing...' : 'Unrestrict'}
                    </button>
                  )}
                  <button
                    className="btn-view-details"
                    onClick={() => setSelectedUser(user)}
                  >
                    View Details
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
                <p>{selectedUser.accepted_terms_at ? 
                  new Date(selectedUser.accepted_terms_at).toLocaleString() : 
                  'Not accepted'
                }</p>
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
            <button onClick={() => setSelectedUser(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageUsers;
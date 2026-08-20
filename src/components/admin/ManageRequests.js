import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';

const ManageRequests = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});
  const [declineReason, setDeclineReason] = useState({});
  const { user } = useAuth();

  // Fetch requests function
  const fetchRequests = async () => {
    try {
      const { data, error } = await supabase
        .from('requests')
        .select(`
          *,
          users:user_id (username, full_name, id_document_url),
          products:product_id (name, quantity)
        `)
        .order('requested_at', { ascending: false });

      if (error) throw error;
      setRequests(data || []);
    } catch (error) {
      console.error('Error fetching requests:', error);
    } finally {
      setLoading(false);
    }
  };

  // Set up realtime subscription
  useEffect(() => {
    fetchRequests();

    let channel = null;

    const setupSubscription = () => {
      channel = supabase
        .channel('admin-requests-channel')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'requests',
          },
          (payload) => {
            console.log('Request change detected:', payload);
            fetchRequests();
          }
        )
        .subscribe((status) => {
          console.log('Admin requests subscription status:', status);
        });
    };

    setupSubscription();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  // Generate signed URL for viewing ID
  const handleViewID = async (requestId) => {
    setActionLoading(prev => ({ ...prev, [requestId]: true }));
    
    try {
      const request = requests.find(r => r.id === requestId);
      if (!request || !request.id_upload_url) {
        alert('No ID document found for this request');
        return;
      }

      // Extract the file path from the URL
      const urlParts = request.id_upload_url.split('/');
      const filePath = urlParts.slice(urlParts.indexOf('id-documents') + 1).join('/');
      
      // Generate a signed URL with 5-minute expiration
      const { data, error } = await supabase.storage
        .from('id-documents')
        .createSignedUrl(filePath, 300); // 300 seconds = 5 minutes

      if (error) throw error;

      if (data?.signedUrl) {
        // Open in new tab
        window.open(data.signedUrl, '_blank');
      } else {
        alert('Could not generate viewable link. Please try again.');
      }
    } catch (error) {
      console.error('Error viewing ID:', error);
      alert('Failed to view ID document. Please try again.');
    } finally {
      setActionLoading(prev => ({ ...prev, [requestId]: false }));
    }
  };

  const handleApprove = async (requestId) => {
    setActionLoading(prev => ({ ...prev, [requestId]: true }));
    
    try {
      const now = new Date();
      const request = requests.find(r => r.id === requestId);
      const duration = request?.duration_minutes || 30;
      
      // Check if product is available
      const { data: productData, error: productError } = await supabase
        .from('products')
        .select('quantity')
        .eq('id', request.product_id)
        .single();

      if (productError) throw productError;

      if (!productData || productData.quantity <= 0) {
        alert('❌ Product is out of stock!');
        setActionLoading(prev => ({ ...prev, [requestId]: false }));
        return;
      }

      // Calculate deadlines
      const pickupDeadline = new Date(now.getTime() + 20 * 60000);
      const returnDeadline = new Date(now.getTime() + (20 + duration) * 60000);

      // Update request
      const { error: requestError } = await supabase
        .from('requests')
        .update({
          status: 'approved',
          approved_at: now.toISOString(),
          pickup_deadline: pickupDeadline.toISOString(),
          return_deadline: returnDeadline.toISOString(),
        })
        .eq('id', requestId);

      if (requestError) throw requestError;

      // Decrease product quantity
      const { error: updateError } = await supabase
        .from('products')
        .update({ quantity: productData.quantity - 1 })
        .eq('id', request.product_id);

      if (updateError) throw updateError;

      // Notify user
      await supabase
        .from('notifications')
        .insert([
          {
            user_id: request?.user_id,
            type: 'request_approved',
            message: `✅ Your request for ${request?.products?.name} has been approved! Please pick it up within 20 minutes.`,
            related_request_id: requestId,
          }
        ]);

      // Refetch requests
      fetchRequests();
    } catch (error) {
      console.error('Error approving request:', error);
      alert('Failed to approve request. Please try again.');
    } finally {
      setActionLoading(prev => ({ ...prev, [requestId]: false }));
    }
  };

  const handleDecline = async (requestId) => {
    const reason = declineReason[requestId] || '';
    if (!reason) {
      alert('Please provide a reason for declining.');
      return;
    }

    setActionLoading(prev => ({ ...prev, [requestId]: true }));
    
    try {
      const request = requests.find(r => r.id === requestId);
      
      const { error } = await supabase
        .from('requests')
        .update({
          status: 'declined',
          decline_reason: reason,
        })
        .eq('id', requestId);

      if (error) throw error;
      
      // Notify user
      await supabase
        .from('notifications')
        .insert([
          {
            user_id: request?.user_id,
            type: 'request_declined',
            message: `❌ Your request for ${request?.products?.name} was declined. Reason: ${reason}`,
            related_request_id: requestId,
          }
        ]);

      fetchRequests();
      setDeclineReason(prev => ({ ...prev, [requestId]: '' }));
    } catch (error) {
      console.error('Error declining request:', error);
      alert('Failed to decline request. Please try again.');
    } finally {
      setActionLoading(prev => ({ ...prev, [requestId]: false }));
    }
  };

  const handleMarkPickedUp = async (requestId) => {
    setActionLoading(prev => ({ ...prev, [requestId]: true }));
    
    try {
      const { error } = await supabase
        .from('requests')
        .update({
          status: 'picked_up',
        })
        .eq('id', requestId);

      if (error) throw error;
      
      fetchRequests();
    } catch (error) {
      console.error('Error marking as picked up:', error);
      alert('Failed to mark as picked up. Please try again.');
    } finally {
      setActionLoading(prev => ({ ...prev, [requestId]: false }));
    }
  };

  const handleMarkReturned = async (requestId) => {
    setActionLoading(prev => ({ ...prev, [requestId]: true }));
    
    try {
      const request = requests.find(r => r.id === requestId);
      
      // Update request status
      const { error: requestError } = await supabase
        .from('requests')
        .update({
          status: 'returned',
          returned_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      if (requestError) throw requestError;

      // Restore product quantity
      const { data: productData } = await supabase
        .from('products')
        .select('quantity')
        .eq('id', request.product_id)
        .single();

      if (productData) {
        await supabase
          .from('products')
          .update({ quantity: productData.quantity + 1 })
          .eq('id', request.product_id);
      }

      // Notify user
      await supabase
        .from('notifications')
        .insert([
          {
            user_id: request?.user_id,
            type: 'time_up',
            message: `✅ Your request for ${request?.products?.name} has been successfully returned. Thank you!`,
            related_request_id: requestId,
          }
        ]);

      fetchRequests();
    } catch (error) {
      console.error('Error marking as returned:', error);
      alert('Failed to mark as returned. Please try again.');
    } finally {
      setActionLoading(prev => ({ ...prev, [requestId]: false }));
    }
  };

  const getStatusBadge = (status) => {
    const statusMap = {
      pending: 'badge-pending',
      approved: 'badge-approved',
      declined: 'badge-declined',
      picked_up: 'badge-picked-up',
      returned: 'badge-returned',
      overdue: 'badge-overdue',
    };
    return `status-badge ${statusMap[status] || 'badge-pending'}`;
  };

  const getStatusColor = (status) => {
    const colors = {
      pending: '#b8860b',
      approved: '#0d47a1',
      declined: '#c62828',
      picked_up: '#e65100',
      returned: '#2e7d32',
      overdue: '#c62828',
    };
    return colors[status] || '#6c757d';
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading requests...</p>
      </div>
    );
  }

  return (
    <div className="admin-requests">
      <div className="admin-header">
        <h2>📋 Manage Requests</h2>
        <div className="request-stats">
          <span className="stat-badge">
            Total: {requests.length}
          </span>
          <span className="stat-badge pending">
            Pending: {requests.filter(r => r.status === 'pending').length}
          </span>
          <span className="stat-badge approved">
            Approved: {requests.filter(r => r.status === 'approved').length}
          </span>
          <span className="stat-badge returned">
            Returned: {requests.filter(r => r.status === 'returned').length}
          </span>
        </div>
      </div>
      
      {requests.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">📋</span>
          <h3>No requests found</h3>
          <p>Requests will appear here when users submit them.</p>
        </div>
      ) : (
        <div className="requests-table-container">
          <table className="requests-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Product</th>
                <th>Duration</th>
                <th>Status</th>
                <th>Requested</th>
                <th>Deadlines</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr key={request.id} className={`request-row status-${request.status}`}>
                  <td>
                    <div className="user-info">
                      <strong className="user-name">{request.users?.full_name || 'Unknown'}</strong>
                      <span className="user-username">@{request.users?.username || 'unknown'}</span>
                    </div>
                  </td>
                  <td>
                    <div className="product-info">
                      <strong className="product-name">{request.products?.name || 'Unknown'}</strong>
                      <br />
                      <small style={{ color: 'var(--medium-gray)' }}>
                        📦 {request.products?.quantity || 0} available
                      </small>
                    </div>
                  </td>
                  <td>{request.duration_minutes} min</td>
                  <td>
                    <span 
                      className={getStatusBadge(request.status)}
                      style={{ 
                        backgroundColor: getStatusColor(request.status) + '20', 
                        color: getStatusColor(request.status) 
                      }}
                    >
                      {request.status.toUpperCase()}
                    </span>
                  </td>
                  <td>
                    <div className="date-info">
                      <div className="date-main">{new Date(request.requested_at).toLocaleDateString()}</div>
                      <div className="date-time">{new Date(request.requested_at).toLocaleTimeString()}</div>
                    </div>
                  </td>
                  <td>
                    <div className="deadline-info">
                      {request.pickup_deadline && (
                        <div className="deadline-item">
                          <strong>Pickup:</strong> {new Date(request.pickup_deadline).toLocaleTimeString()}
                        </div>
                      )}
                      {request.return_deadline && (
                        <div className="deadline-item">
                          <strong>Return:</strong> {new Date(request.return_deadline).toLocaleTimeString()}
                        </div>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="action-buttons">
                      {request.status === 'pending' && (
                        <div className="action-group">
                          <button
                            className="btn-approve"
                            onClick={() => handleApprove(request.id)}
                            disabled={actionLoading[request.id]}
                          >
                            {actionLoading[request.id] ? '⏳' : '✅ Approve'}
                          </button>
                          <div className="decline-section">
                            <input
                              type="text"
                              placeholder="Decline reason..."
                              value={declineReason[request.id] || ''}
                              onChange={(e) => setDeclineReason(prev => ({
                                ...prev,
                                [request.id]: e.target.value
                              }))}
                              disabled={actionLoading[request.id]}
                            />
                            <button
                              className="btn-decline"
                              onClick={() => handleDecline(request.id)}
                              disabled={actionLoading[request.id]}
                            >
                              {actionLoading[request.id] ? '⏳' : '❌ Decline'}
                            </button>
                          </div>
                        </div>
                      )}
                      
                      {request.status === 'approved' && (
                        <button
                          className="btn-pickup"
                          onClick={() => handleMarkPickedUp(request.id)}
                          disabled={actionLoading[request.id]}
                        >
                          {actionLoading[request.id] ? '⏳' : '📦 Picked Up'}
                        </button>
                      )}
                      
                      {request.status === 'picked_up' && (
                        <button
                          className="btn-return"
                          onClick={() => handleMarkReturned(request.id)}
                          disabled={actionLoading[request.id]}
                        >
                          {actionLoading[request.id] ? '⏳' : '🔄 Returned'}
                        </button>
                      )}

                      {request.id_upload_url && (
                        <button
                          onClick={() => handleViewID(request.id)}
                          className="view-id-btn"
                          disabled={actionLoading[request.id]}
                        >
                          {actionLoading[request.id] ? '⏳' : '🪪 View ID'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ManageRequests;
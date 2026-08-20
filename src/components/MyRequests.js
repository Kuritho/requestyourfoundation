import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';

const MyRequests = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    // Fetch requests
    const fetchRequests = async () => {
      if (!user?.id) {
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('requests')
          .select(`
            *,
            products:product_id (name, image_url)
          `)
          .eq('user_id', user.id)
          .order('requested_at', { ascending: false });

        if (error) throw error;
        setRequests(data || []);
      } catch (error) {
        console.error('Error fetching requests:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchRequests();

    // Set up realtime subscription
    let channel = null;

    const setupSubscription = async () => {
      if (!user?.id) return;

      channel = supabase
        .channel(`requests-${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'requests',
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            // Refetch requests on any change
            fetchRequests();
          }
        )
        .subscribe((status) => {
          console.log('Requests subscription status:', status);
        });
    };

    setupSubscription();

    // Cleanup
    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [user?.id]);

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

  if (loading) {
    return <div className="loading">Loading your requests...</div>;
  }

  return (
    <div className="requests-container">
      <h2>My Requests</h2>
      
      {requests.length === 0 ? (
        <p className="no-requests">You haven't made any requests yet.</p>
      ) : (
        <div className="requests-list">
          {requests.map((request) => (
            <div key={request.id} className="request-card">
              <div className="request-header">
                <h3>{request.products?.name || 'Unknown Product'}</h3>
                <span className={getStatusBadge(request.status)}>
                  {request.status.toUpperCase()}
                </span>
              </div>
              
              <div className="request-details">
                <p><strong>Duration:</strong> {request.duration_minutes} minutes</p>
                <p><strong>Requested:</strong> {new Date(request.requested_at).toLocaleString()}</p>
                {request.approved_at && (
                  <p><strong>Approved:</strong> {new Date(request.approved_at).toLocaleString()}</p>
                )}
                {request.pickup_deadline && (
                  <p><strong>Pickup Deadline:</strong> {new Date(request.pickup_deadline).toLocaleString()}</p>
                )}
                {request.return_deadline && (
                  <p><strong>Return Deadline:</strong> {new Date(request.return_deadline).toLocaleString()}</p>
                )}
                {request.returned_at && (
                  <p><strong>Returned:</strong> {new Date(request.returned_at).toLocaleString()}</p>
                )}
                {request.decline_reason && (
                  <p><strong>Decline Reason:</strong> {request.decline_reason}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MyRequests;
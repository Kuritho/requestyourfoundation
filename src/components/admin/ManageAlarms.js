import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';

const ManageAlarms = () => {
  const [alarms, setAlarms] = useState([]);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const { user, userData } = useAuth();
  const [liveAlarm, setLiveAlarm] = useState(false);

  // Fetch alarms + status
  const fetchAlarms = async () => {
    try {
      const { data, error } = await supabase
        .from('alarm_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      setAlarms(data || []);
    } catch (err) {
      console.error('Error fetching alarms:', err);
    }
  };

  const fetchStatus = async () => {
    try {
      const { data, error } = await supabase
        .from('gate_status')
        .select('*')
        .eq('id', 1)
        .single();
      if (error) throw error;
      setStatus(data);
      setLiveAlarm(data?.alarm_active || false);
    } catch (err) {
      console.error('Error fetching status:', err);
    }
  };

  useEffect(() => {
    const loadAll = async () => {
      await Promise.all([fetchAlarms(), fetchStatus()]);
      setLoading(false);
    };
    loadAll();

    // Realtime: new alarm logs
    const logChannel = supabase
      .channel('alarm-logs-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'alarm_logs' },
        (payload) => {
          setAlarms((prev) => [payload.new, ...prev].slice(0, 100));

          // Play alert sound for new alarm
          if (payload.new.event_type === 'ALARM_STARTED') {
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

    // Realtime: gate status
    const statusChannel = supabase
      .channel('gate-status-realtime')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'gate_status' },
        (payload) => {
          setStatus(payload.new);
          setLiveAlarm(payload.new.alarm_active || false);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(logChannel);
      supabase.removeChannel(statusChannel);
    };
  }, []);

  // Mark alarm as resolved
  const handleResolve = async (alarm) => {
    if (!window.confirm('Mark this alarm as resolved?')) return;
    try {
      const { error } = await supabase
        .from('alarm_logs')
        .update({
          resolved: true,
          resolved_by: user?.id,
          resolved_by_name: userData?.full_name || 'Admin',
          resolved_at: new Date().toISOString(),
        })
        .eq('id', alarm.id);
      if (error) throw error;
      setSuccess('✅ Alarm marked as resolved');
      fetchAlarms();
      setTimeout(() => setSuccess(''), 2000);
    } catch (err) {
      setError(err.message);
    }
  };

  const getEventBadge = (type) => {
    const map = {
      VIBRATION_DETECTED: 'event-alarm_triggered',
      ALARM_STARTED: 'event-alarm_triggered',
      ALARM_STOPPED: 'event-access_granted',
      ALARM_MANUAL_STOP: 'event-access_granted',
      TEST_TRIGGERED: 'event-gate_opened',
    };
    return `event-badge ${map[type] || 'event-system_online'}`;
  };

  const filteredAlarms =
    filter === 'all'
      ? alarms
      : filter === 'unresolved'
      ? alarms.filter((a) => !a.resolved)
      : alarms.filter((a) => a.event_type === filter);

  const unresolvedCount = alarms.filter((a) => !a.resolved).length;

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading alarm system...</p>
      </div>
    );
  }

  return (
    <div className="admin-alarms">
      {/* Live Alarm Banner */}
      {liveAlarm && (
        <div className="alarm-banner">
          <span className="alarm-icon">🚨</span>
          <div className="alarm-text">
            <strong>ALARM ACTIVE</strong>
            <span>
              Vibration detected! The alarm is currently sounding on{' '}
              {status?.device_id || 'the device'}.
            </span>
          </div>
        </div>
      )}

      <div className="admin-header">
        <h2>🚨 Alarm System</h2>
        <span className="product-count">
          {alarms.length} events · {unresolvedCount} unresolved
        </span>
      </div>

      {error && <div className="error-message">❌ {error}</div>}
      {success && <div className="success-message">{success}</div>}

      {/* Status Cards */}
      <div className="stats-grid admin-stats-grid" style={{ marginBottom: '28px' }}>
        <div className={`stat-card admin-stat-card ${status?.alarm_active ? 'restricted' : ''}`}>
          <div className="stat-icon">{status?.alarm_active ? '🚨' : '🔕'}</div>
          <div className="stat-info">
            <h3>{status?.alarm_active ? 'ALARM' : 'Normal'}</h3>
            <p>Alarm State</p>
            <span className={`stat-change ${status?.alarm_active ? 'danger' : 'positive'}`}>
              {status?.alarm_active ? 'Actively sounding' : 'Quiet'}
            </span>
          </div>
        </div>

        <div className="stat-card admin-stat-card">
          <div className="stat-icon">🔓</div>
          <div className="stat-info">
            <h3>{status?.gate_open ? 'Open' : 'Closed'}</h3>
            <p>Gate State</p>
            <span className="stat-change positive">Current</span>
          </div>
        </div>

        <div className="stat-card admin-stat-card">
          <div className="stat-icon">📳</div>
          <div className="stat-info">
            <h3>{status?.vibration_count_today || 0}</h3>
            <p>Vibrations Today</p>
            <span className="stat-change warning">Since midnight</span>
          </div>
        </div>

        <div className={`stat-card admin-stat-card ${status?.device_online ? '' : 'restricted'}`}>
          <div className="stat-icon">{status?.device_online ? '🟢' : '🔴'}</div>
          <div className="stat-info">
            <h3>{status?.device_online ? 'Online' : 'Offline'}</h3>
            <p>Device</p>
            <span className={`stat-change ${status?.device_online ? 'positive' : 'danger'}`}>
              {status?.last_heartbeat
                ? new Date(status.last_heartbeat).toLocaleTimeString()
                : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="log-filter">
        <button
          className={filter === 'all' ? 'active' : ''}
          onClick={() => setFilter('all')}
        >
          All ({alarms.length})
        </button>
        <button
          className={filter === 'unresolved' ? 'active' : ''}
          onClick={() => setFilter('unresolved')}
        >
          ⚠️ Unresolved ({unresolvedCount})
        </button>
        <button
          className={filter === 'ALARM_STARTED' ? 'active' : ''}
          onClick={() => setFilter('ALARM_STARTED')}
        >
          🚨 Alarms
        </button>
        <button
          className={filter === 'VIBRATION_DETECTED' ? 'active' : ''}
          onClick={() => setFilter('VIBRATION_DETECTED')}
        >
          📳 Vibrations
        </button>
        <button
          className={filter === 'ALARM_STOPPED' ? 'active' : ''}
          onClick={() => setFilter('ALARM_STOPPED')}
        >
          🔕 Stopped
        </button>
      </div>

      {/* Logs Table */}
      <div className="requests-table-container">
        <table className="requests-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Event</th>
              <th>Device</th>
              <th>Details</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredAlarms.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '32px' }}>
                  No alarm events yet
                </td>
              </tr>
            ) : (
              filteredAlarms.map((alarm) => (
                <tr key={alarm.id} className={!alarm.resolved ? 'log-alarm_triggered' : ''}>
                  <td>
                    <div className="date-info">
                      <div className="date-main">
                        {new Date(alarm.created_at).toLocaleDateString()}
                      </div>
                      <div className="date-time">
                        {new Date(alarm.created_at).toLocaleTimeString()}
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={getEventBadge(alarm.event_type)}>
                      {alarm.event_type.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td>
                    <small>{alarm.device_id || '—'}</small>
                  </td>
                  <td>{alarm.details || '—'}</td>
                  <td>
                    {alarm.resolved ? (
                      <span className="status-active">
                        ✅ Resolved
                        {alarm.resolved_by_name && (
                          <small> by {alarm.resolved_by_name}</small>
                        )}
                      </span>
                    ) : (
                      <span className="status-restricted">⚠️ Unresolved</span>
                    )}
                  </td>
                  <td>
                    {!alarm.resolved && (
                      <button
                        className="btn-approve"
                        onClick={() => handleResolve(alarm)}
                      >
                        ✅ Resolve
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ManageAlarms;
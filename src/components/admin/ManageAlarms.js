import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../supabaseClient';

const ManageAlarms = () => {
  const [alarms, setAlarms] = useState([]);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [liveAlarm, setLiveAlarm] = useState(false);
  
  // Reference to prevent sound from playing multiple times
  const alarmSoundPlayed = useRef(false);

  // Play a loud beeping sound when alarm triggers
  const playAlertSound = () => {
    try {
      // You can replace this URL with a local .mp3 file in your public folder
      // e.g. new Audio('/alarm.mp3')
      const audio = new Audio('https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg');
      audio.volume = 1.0; 
      audio.play().catch((e) => {
        console.log("Browser blocked audio autoplay until user interacts with page.");
      });
    } catch (e) {
      console.log("Audio error:", e);
    }
  };

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
      
      // Update live alarm state
      const isAlarmOn = data?.alarm_active || false;
      setLiveAlarm(isAlarmOn);

      // Play sound if it just turned on
      if (isAlarmOn && !alarmSoundPlayed.current) {
        playAlertSound();
        alarmSoundPlayed.current = true;
      } else if (!isAlarmOn) {
        alarmSoundPlayed.current = false;
      }

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

    // Listen for real-time updates in the database
    const logChannel = supabase
      .channel('alarm-logs-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'alarm_logs' },
        (payload) => {
          setAlarms((prev) => [payload.new, ...prev].slice(0, 100));
        }
      )
      .subscribe();

    const statusChannel = supabase
      .channel('gate-status-realtime')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'gate_status' },
        (payload) => {
          const isAlarmOn = payload.new.alarm_active || false;
          setStatus(payload.new);
          setLiveAlarm(isAlarmOn);

          // Play sound if alarm turned on
          if (isAlarmOn && !alarmSoundPlayed.current) {
            playAlertSound();
            alarmSoundPlayed.current = true;
          } else if (!isAlarmOn) {
            alarmSoundPlayed.current = false;
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(logChannel);
      supabase.removeChannel(statusChannel);
    };
  }, []);

  const handleResolve = async (alarm) => {
    if (!window.confirm('Mark this alarm as resolved?')) return;
    try {
      const { error } = await supabase
        .from('alarm_logs')
        .update({
          resolved: true,
          resolved_by_name: 'Admin',
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
    };
    return `event-badge ${map[type] || 'event-system_online'}`;
  };

  const filteredAlarms = filter === 'all'
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
      {/* 🚨 LIVE ALARM BANNER 🚨 */}
      {liveAlarm && (
        <div className="alarm-banner" style={{ backgroundColor: '#c62828', animation: 'alarmBannerPulse 1s infinite' }}>
          <span className="alarm-icon" style={{ fontSize: '40px' }}>🚨</span>
          <div className="alarm-text">
            <strong style={{ color: 'white', fontSize: '20px' }}>ALARM TRIGGERED!</strong>
            <span style={{ color: 'white' }}>The bag was opened without fingerprint authorization.</span>
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
          </div>
        </div>

        <div className="stat-card admin-stat-card">
          <div className="stat-icon">📳</div>
          <div className="stat-info">
            <h3>{status?.vibration_count_today || 0}</h3>
            <p>Triggers Today</p>
          </div>
        </div>

        <div className={`stat-card admin-stat-card ${status?.device_online ? '' : 'restricted'}`}>
          <div className="stat-icon">{status?.device_online ? '🟢' : '🔴'}</div>
          <div className="stat-info">
            <h3>{status?.device_online ? 'Online' : 'Offline'}</h3>
            <p>Device</p>
          </div>
        </div>
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
                      <div className="date-main">{new Date(alarm.created_at).toLocaleDateString()}</div>
                      <div className="date-time">{new Date(alarm.created_at).toLocaleTimeString()}</div>
                    </div>
                  </td>
                  <td>
                    <span className={getEventBadge(alarm.event_type)}>
                      {alarm.event_type.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td><small>{alarm.device_id || '—'}</small></td>
                  <td>{alarm.details || '—'}</td>
                  <td>
                    {alarm.resolved ? (
                      <span className="status-active">✅ Resolved</span>
                    ) : (
                      <span className="status-restricted">⚠️ Unresolved</span>
                    )}
                  </td>
                  <td>
                    {!alarm.resolved && (
                      <button className="btn-approve" onClick={() => handleResolve(alarm)}>
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

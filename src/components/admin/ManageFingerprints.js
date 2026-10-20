import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';

const ManageFingerprints = () => {
  const [fingerprints, setFingerprints] = useState([]);
  const [logs, setLogs] = useState([]);
  const [device, setDevice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // ============================================
  // FETCH
  // ============================================
  const fetchFingerprints = async () => {
    try {
      const { data, error } = await supabase
        .from('fingerprints')
        .select('*')
        .order('fingerprint_id', { ascending: true });
      if (error) throw error;
      setFingerprints(data || []);
    } catch (err) {
      console.error('Error fetching fingerprints:', err);
    }
  };

  const fetchLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('fingerprint_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      setLogs(data || []);
    } catch (err) {
      console.error('Error fetching logs:', err);
    }
  };

  const fetchDevice = async () => {
    try {
      const { data, error } = await supabase
        .from('fingerprint_device')
        .select('*')
        .eq('id', 1)
        .single();
      if (error) throw error;
      setDevice(data);
    } catch (err) {
      console.error('Error fetching device:', err);
    }
  };

  useEffect(() => {
    const loadAll = async () => {
      await Promise.all([fetchFingerprints(), fetchLogs(), fetchDevice()]);
      setLoading(false);
    };
    loadAll();

    const fpChannel = supabase
      .channel('fingerprints-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'fingerprints' },
        () => fetchFingerprints()
      )
      .subscribe();

    const logChannel = supabase
      .channel('fingerprint-logs-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'fingerprint_logs' },
        (payload) => {
          setLogs((prev) => [payload.new, ...prev].slice(0, 100));
        }
      )
      .subscribe();

    const deviceChannel = supabase
      .channel('fingerprint-device-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'fingerprint_device' },
        (payload) => setDevice(payload.new)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(fpChannel);
      supabase.removeChannel(logChannel);
      supabase.removeChannel(deviceChannel);
    };
  }, []);

  // ============================================
  // ACTIONS
  // ============================================
  const handleSaveName = async (fp) => {
    if (!editName.trim()) {
      setError('Name cannot be empty');
      return;
    }
    setError('');
    try {
      const { error } = await supabase
        .from('fingerprints')
        .update({ display_name: editName.trim() })
        .eq('id', fp.id);
      if (error) throw error;
      setSuccess('✅ Name updated!');
      setEditingId(null);
      setEditName('');
      fetchFingerprints();
      setTimeout(() => setSuccess(''), 2000);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleToggleActive = async (fp) => {
    try {
      const { error } = await supabase
        .from('fingerprints')
        .update({ is_active: !fp.is_active })
        .eq('id', fp.id);
      if (error) throw error;
      fetchFingerprints();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (fp) => {
    if (
      !window.confirm(
        `Delete fingerprint #${fp.fingerprint_id} (${fp.display_name})?\n\n` +
          `Note: This only removes it from the database. ` +
          `You must also delete it from the sensor via the keypad (Key 3).`
      )
    )
      return;

    try {
      const { error } = await supabase
        .from('fingerprints')
        .delete()
        .eq('id', fp.id);
      if (error) throw error;
      setSuccess('✅ Fingerprint removed');
      fetchFingerprints();
      setTimeout(() => setSuccess(''), 2000);
    } catch (err) {
      setError(err.message);
    }
  };

  // ============================================
  // HELPERS
  // ============================================
  const isOnline =
    device?.device_online &&
    new Date() - new Date(device.last_heartbeat) < 60000;

  const getEventBadge = (type) => {
    const map = {
      SCAN_SUCCESS: 'event-access_granted',
      SCAN_FAILED: 'event-access_denied',
      REGISTERED: 'event-gate_opened',
      DELETED: 'event-alarm_triggered',
      DEVICE_ONLINE: 'event-system_online',
      DEVICE_OFFLINE: 'event-system_offline',
    };
    return `event-badge ${map[type] || 'event-system_online'}`;
  };

  const filteredLogs =
    filter === 'all' ? logs : logs.filter((l) => l.event_type === filter);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading fingerprint data...</p>
      </div>
    );
  }

  return (
    <div className="admin-fingerprints">
      <div className="admin-header">
        <h2>🔐 Fingerprint Management</h2>
        <span className="product-count">{fingerprints.length} registered</span>
      </div>

      {error && <div className="error-message">❌ {error}</div>}
      {success && <div className="success-message">{success}</div>}

      {/* ============================================ */}
      {/* STATUS CARDS */}
      {/* ============================================ */}
      <div className="stats-grid admin-stats-grid" style={{ marginBottom: '28px' }}>
        <div className={`stat-card admin-stat-card ${isOnline ? '' : 'restricted'}`}>
          <div className="stat-icon">{isOnline ? '🟢' : '🔴'}</div>
          <div className="stat-info">
            <h3>{isOnline ? 'Online' : 'Offline'}</h3>
            <p>Device Status</p>
            <span className={`stat-change ${isOnline ? 'positive' : 'danger'}`}>
              {isOnline ? 'Connected' : 'No signal'}
            </span>
          </div>
        </div>

        <div className="stat-card admin-stat-card">
          <div className="stat-icon">👆</div>
          <div className="stat-info">
            <h3>{device?.total_registered || fingerprints.length}</h3>
            <p>Total Registered</p>
            <span className="stat-change positive">On sensor</span>
          </div>
        </div>

        <div className="stat-card admin-stat-card">
          <div className="stat-icon">📋</div>
          <div className="stat-info">
            <h3>{logs.length}</h3>
            <p>Recent Events</p>
            <span className="stat-change positive">Last 100</span>
          </div>
        </div>

        <div className="stat-card admin-stat-card pending">
          <div className="stat-icon">⏰</div>
          <div className="stat-info">
            <h3>
              {device?.last_heartbeat
                ? new Date(device.last_heartbeat).toLocaleTimeString()
                : '--:--'}
            </h3>
            <p>Last Heartbeat</p>
          </div>
        </div>
      </div>

      {/* ============================================ */}
      {/* REGISTERED FINGERPRINTS */}
      {/* ============================================ */}
      <div className="fingerprint-users-section">
        <h3>👆 Registered Fingerprints</h3>
        {fingerprints.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">👆</span>
            <h3>No fingerprints registered yet</h3>
            <p>
              Press the REGISTER key (1) on the ESP32 or use the "My
              Fingerprint" page to add fingerprints.
            </p>
          </div>
        ) : (
          <div className="fingerprint-grid">
            {fingerprints.map((fp) => (
              <div
                key={fp.id}
                className="fingerprint-card"
                style={{ opacity: fp.is_active ? 1 : 0.5 }}
              >
                <div className="fp-id">#{fp.fingerprint_id}</div>
                <div className="fp-info">
                  {editingId === fp.id ? (
                    <div style={{ display: 'flex', gap: '4px', width: '100%' }}>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) =>
                          e.key === 'Enter' && handleSaveName(fp)
                        }
                        autoFocus
                        style={{
                          flex: 1,
                          padding: '4px 8px',
                          fontSize: '12px',
                          borderRadius: '4px',
                          border: '1px solid var(--primary)',
                        }}
                      />
                      <button
                        onClick={() => handleSaveName(fp)}
                        style={{ padding: '4px 8px', fontSize: '11px' }}
                      >
                        ✓
                      </button>
                    </div>
                  ) : (
                    <>
                      <strong>{fp.display_name}</strong>
                      <span
                        className={`role-badge badge-${
                          fp.role === 'admin' ? 'admin' : 'user'
                        }`}
                      >
                        {fp.role}
                      </span>
                    </>
                  )}
                </div>
                <div className="fp-actions">
                  <button
                    title="Rename"
                    onClick={() => {
                      setEditingId(fp.id);
                      setEditName(fp.display_name);
                    }}
                  >
                    ✏️
                  </button>
                  <button
                    title={fp.is_active ? 'Disable' : 'Enable'}
                    onClick={() => handleToggleActive(fp)}
                  >
                    {fp.is_active ? '🚫' : '✅'}
                  </button>
                  <button
                    title="Delete"
                    onClick={() => handleDelete(fp)}
                    style={{ color: 'var(--error)' }}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ============================================ */}
      {/* DEVICE MANAGEMENT */}
      {/* ============================================ */}
      <ManageDevices />

      {/* ============================================ */}
      {/* FILTER */}
      {/* ============================================ */}
      <div className="log-filter" style={{ marginTop: '28px' }}>
        <button
          className={filter === 'all' ? 'active' : ''}
          onClick={() => setFilter('all')}
        >
          All ({logs.length})
        </button>
        <button
          className={filter === 'REGISTERED' ? 'active' : ''}
          onClick={() => setFilter('REGISTERED')}
        >
          ✅ Registered
        </button>
        <button
          className={filter === 'SCAN_SUCCESS' ? 'active' : ''}
          onClick={() => setFilter('SCAN_SUCCESS')}
        >
          👆 Scans
        </button>
        <button
          className={filter === 'SCAN_FAILED' ? 'active' : ''}
          onClick={() => setFilter('SCAN_FAILED')}
        >
          ❌ Failed
        </button>
      </div>

      {/* ============================================ */}
      {/* LOGS */}
      {/* ============================================ */}
      <div className="requests-table-container">
        <table className="requests-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Event</th>
              <th>Fingerprint</th>
              <th>Device</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.length === 0 ? (
              <tr>
                <td
                  colSpan="5"
                  style={{ textAlign: 'center', padding: '32px' }}
                >
                  No events yet
                </td>
              </tr>
            ) : (
              filteredLogs.map((log) => (
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
                    <span className={getEventBadge(log.event_type)}>
                      {log.event_type.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td>
                    <strong>{log.display_name || '—'}</strong>
                    {log.fingerprint_id > 0 && (
                      <span className="fp-id-badge">
                        {' '}
                        #{log.fingerprint_id}
                      </span>
                    )}
                  </td>
                  <td>
                    <small style={{ color: 'var(--medium-gray)' }}>
                      {log.device_id || '—'}
                    </small>
                  </td>
                  <td>{log.details || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ============================================
// DEVICE MANAGEMENT SUB-COMPONENT
// ============================================
const ManageDevices = () => {
  const [devices, setDevices] = useState([]);
  const [editingDevice, setEditingDevice] = useState(null);
  const [form, setForm] = useState({ id: '', display_name: '', location: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchDevices = async () => {
    const { data } = await supabase
      .from('fingerprint_devices')
      .select('*')
      .order('display_name');
    setDevices(data || []);
  };

  useEffect(() => {
    fetchDevices();
    const channel = supabase
      .channel('devices-admin')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'fingerprint_devices' },
        () => fetchDevices()
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!form.id.trim() || !form.display_name.trim()) {
      setError('ID and Display Name are required');
      return;
    }

    try {
      if (editingDevice) {
        const { error } = await supabase
          .from('fingerprint_devices')
          .update({
            display_name: form.display_name,
            location: form.location,
          })
          .eq('id', editingDevice.id);
        if (error) throw error;
        setSuccess('✅ Device updated!');
      } else {
        const { error } = await supabase
          .from('fingerprint_devices')
          .insert([
            {
              id: form.id.trim(),
              display_name: form.display_name.trim(),
              location: form.location.trim(),
            },
          ]);
        if (error) throw error;
        setSuccess('✅ Device added!');
      }

      setForm({ id: '', display_name: '', location: '' });
      setEditingDevice(null);
      fetchDevices();
      setTimeout(() => setSuccess(''), 2000);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (device) => {
    if (
      !window.confirm(
        `Delete device "${device.display_name}"?\n\nNote: The ESP32 will keep using this ID but won't appear in the picker.`
      )
    )
      return;
    try {
      await supabase.from('fingerprint_devices').delete().eq('id', device.id);
      fetchDevices();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleEdit = (device) => {
    setEditingDevice(device);
    setForm({
      id: device.id,
      display_name: device.display_name,
      location: device.location || '',
    });
  };

  return (
    <div className="fingerprint-users-section" style={{ marginTop: '28px' }}>
      <h3>🖥️ Registered Devices</h3>
      <p
        style={{
          color: 'var(--medium-gray)',
          fontSize: '13px',
          marginBottom: '16px',
        }}
      >
        Each physical ESP32 must be registered here with its matching ID. The ID
        in this table must match the <code>DEVICE_ID</code> constant in your
        ESP32 code.
      </p>

      {error && <div className="error-message">❌ {error}</div>}
      {success && <div className="success-message">✅ {success}</div>}

      <form
        onSubmit={handleSave}
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr auto',
          gap: '10px',
          marginBottom: '20px',
        }}
      >
        <input
          type="text"
          placeholder="Device ID (e.g., esp32-fingerprint-01)"
          value={form.id}
          onChange={(e) => setForm({ ...form, id: e.target.value })}
          disabled={!!editingDevice}
          required
        />
        <input
          type="text"
          placeholder="Display Name"
          value={form.display_name}
          onChange={(e) => setForm({ ...form, display_name: e.target.value })}
          required
        />
        <input
          type="text"
          placeholder="Location (optional)"
          value={form.location}
          onChange={(e) => setForm({ ...form, location: e.target.value })}
        />
        <div style={{ display: 'flex', gap: '6px' }}>
          <button type="submit" className="btn-approve">
            {editingDevice ? '💾 Save' : '➕ Add'}
          </button>
          {editingDevice && (
            <button
              type="button"
              className="btn-decline"
              onClick={() => {
                setEditingDevice(null);
                setForm({ id: '', display_name: '', location: '' });
              }}
            >
              ✕
            </button>
          )}
        </div>
      </form>

      {devices.length === 0 ? (
        <p style={{ textAlign: 'center', color: 'var(--medium-gray)' }}>
          No devices registered yet.
        </p>
      ) : (
        <div className="fingerprint-grid">
          {devices.map((d) => {
            const online =
              d.device_online &&
              new Date() - new Date(d.last_heartbeat) < 60000;
            return (
              <div key={d.id} className="fingerprint-card">
                <div className="fp-id">{online ? '🟢' : '🔴'}</div>
                <div className="fp-info">
                  <strong>{d.display_name}</strong>
                  <span
                    style={{ fontSize: '11px', color: 'var(--medium-gray)' }}
                  >
                    {d.id}
                  </span>
                  {d.location && (
                    <span
                      style={{ fontSize: '11px', color: 'var(--medium-gray)' }}
                    >
                      📍 {d.location}
                    </span>
                  )}
                </div>
                <div className="fp-actions">
                  <button onClick={() => handleEdit(d)} title="Edit">
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDelete(d)}
                    title="Delete"
                    style={{ color: 'var(--error)' }}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ManageFingerprints;

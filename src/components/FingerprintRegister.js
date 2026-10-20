import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';

const FingerprintRegister = () => {
  const { user, userData } = useAuth();
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState('choose-device');
  const [existingFingerprint, setExistingFingerprint] = useState(null);

  // ============================================
  // FETCH DEVICES
  // ============================================
  const fetchDevices = async () => {
    try {
      const { data, error } = await supabase
        .from('fingerprint_devices')
        .select('*')
        .order('display_name', { ascending: true });

      if (error) throw error;

      const enriched = (data || []).map((d) => {
        const online =
          d.device_online &&
          new Date() - new Date(d.last_heartbeat) < 60000;
        return { ...d, is_online: online };
      });

      setDevices(enriched);
    } catch (err) {
      console.error('Error fetching devices:', err);
    }
  };

  // ============================================
  // CHECK IF USER ALREADY HAS FINGERPRINT
  // ============================================
  const checkExistingFingerprint = async () => {
    if (!user?.id) return;

    try {
      const { data } = await supabase
        .from('fingerprints')
        .select('*')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();

      setExistingFingerprint(data);
    } catch (err) {
      console.error('Error checking fingerprint:', err);
    }
  };

  useEffect(() => {
    fetchDevices();
    checkExistingFingerprint();

    const interval = setInterval(() => {
      fetchDevices();
      checkExistingFingerprint();
    }, 10000);

    const deviceChannel = supabase
      .channel('devices-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'fingerprint_devices' },
        () => fetchDevices()
      )
      .subscribe();

    const fpChannel = supabase
      .channel('user-fingerprints')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'fingerprints' },
        () => checkExistingFingerprint()
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(deviceChannel);
      supabase.removeChannel(fpChannel);
    };
  }, [user?.id]);

  // ============================================
  // LOAD EXISTING PENDING REQUEST
  // ============================================
  useEffect(() => {
    if (!user?.id) return;

    const loadExisting = async () => {
      const { data } = await supabase
        .from('fingerprint_requests')
        .select('*')
        .eq('user_id', user.id)
        .in('status', ['pending', 'processing'])
        .order('requested_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        setRequest(data);
        setStep('registering');

        const dev = devices.find((d) => d.id === data.device_id);
        if (dev) setSelectedDevice(dev);
      }
    };

    loadExisting();
  }, [user?.id, devices]);

  // ============================================
  // REALTIME REQUEST TRACKING
  // ============================================
  useEffect(() => {
    if (!request?.id) return;

    const channel = supabase
      .channel(`fp-request-${request.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'fingerprint_requests',
          filter: `id=eq.${request.id}`,
        },
        (payload) => setRequest(payload.new)
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [request?.id]);

  // ============================================
  // HANDLERS
  // ============================================
  const handleChooseDevice = (device) => {
    if (!device.is_online) {
      setError(`❌ ${device.display_name} is offline. Choose another device.`);
      return;
    }
    setError('');
    setSelectedDevice(device);
  };

  const handleStartRegistration = async () => {
    if (!selectedDevice) {
      setError('Please choose a device first');
      return;
    }

    setError('');
    setLoading(true);

    try {
      // Clean up old pending requests
      await supabase
        .from('fingerprint_requests')
        .delete()
        .eq('user_id', user.id)
        .eq('status', 'pending');

      const { data, error: insertError } = await supabase
        .from('fingerprint_requests')
        .insert([
          {
            user_id: user.id,
            user_name: userData?.full_name || user.email,
            user_role: userData?.role || 'user',
            device_id: selectedDevice.id,
            status: 'pending',
          },
        ])
        .select()
        .single();

      if (insertError) throw insertError;

      setRequest(data);
      setStep('registering');
    } catch (err) {
      console.error('Registration request error:', err);
      setError(err.message || 'Failed to send request');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!request?.id) return;
    try {
      await supabase.from('fingerprint_requests').delete().eq('id', request.id);
      setRequest(null);
      setSelectedDevice(null);
      setStep('choose-device');
      setError('');
    } catch (err) {
      setError('Failed to cancel');
    }
  };

  const handleReset = () => {
    setRequest(null);
    setSelectedDevice(null);
    setStep('choose-device');
    setError('');
  };

  const handleDeleteExisting = async () => {
    if (!existingFingerprint) return;
    if (
      !window.confirm(
        'Delete your existing fingerprint?\n\nYou will need to re-register.'
      )
    )
      return;

    try {
      await supabase
        .from('fingerprints')
        .delete()
        .eq('id', existingFingerprint.id);
      setExistingFingerprint(null);
    } catch (err) {
      setError(err.message);
    }
  };

  // ============================================
  // SUCCESS SCREEN
  // ============================================
  if (request?.status === 'completed') {
    return (
      <div className="fp-register-card fp-success">
        <div className="fp-reg-icon">✅</div>
        <h3>Fingerprint Registered!</h3>
        <p>
          Your fingerprint has been saved with ID{' '}
          <strong>#{request.assigned_fingerprint_id}</strong> on{' '}
          <strong>{selectedDevice?.display_name || 'the device'}</strong>.
        </p>
        <p className="fp-reg-hint">
          You can now use your fingerprint for gate access.
        </p>
        <button className="fp-reg-btn-secondary" onClick={handleReset}>
          Register Another
        </button>
      </div>
    );
  }

  // ============================================
  // FAILED SCREEN
  // ============================================
  if (request?.status === 'failed') {
    return (
      <div className="fp-register-card fp-failed">
        <div className="fp-reg-icon">❌</div>
        <h3>Registration Failed</h3>
        <p>{request.error_message || 'Something went wrong'}</p>
        <button className="fp-reg-btn-primary" onClick={handleReset}>
          Try Again
        </button>
      </div>
    );
  }

  // ============================================
  // PENDING / PROCESSING
  // ============================================
  if (
    step === 'registering' &&
    (request?.status === 'pending' || request?.status === 'processing')
  ) {
    return (
      <div className="fp-register-card fp-pending">
        <div className="fp-reg-icon fp-pulse">👆</div>
        <h3>
          {request.status === 'pending'
            ? 'Waiting for Device...'
            : 'Ready to Scan!'}
        </h3>
        <p>
          <strong>{selectedDevice?.display_name || 'Device'}</strong>
          <br />
          {request.status === 'pending'
            ? 'The fingerprint device will activate shortly.'
            : 'Go to the device and scan your finger twice.'}
        </p>
        <div className="fp-reg-steps">
          <span className={request.status !== 'pending' ? 'active' : ''}>
            1. Place finger
          </span>
          <span>2. Remove finger</span>
          <span>3. Place same finger again</span>
        </div>
        {request.status === 'pending' && (
          <button className="fp-reg-btn-secondary" onClick={handleCancel}>
            Cancel Request
          </button>
        )}
      </div>
    );
  }

  // ============================================
  // DEFAULT — CHOOSE DEVICE
  // ============================================
  return (
    <div className="fp-register-card">
      <div className="fp-reg-icon">🔐</div>
      <h3>
        {existingFingerprint
          ? 'Your Registered Fingerprint'
          : 'Choose Your Fingerprint Device'}
      </h3>

      {/* If already registered, show existing */}
      {existingFingerprint && (
        <div className="fp-existing">
          <div className="fp-existing-badge">✅ Registered</div>
          <div className="fp-existing-info">
            <p>
              <strong>{existingFingerprint.display_name}</strong>
            </p>
            <p>
              Fingerprint ID:{' '}
              <strong>#{existingFingerprint.fingerprint_id}</strong>
            </p>
            <p className="fp-reg-hint">
              Registered on{' '}
              {new Date(existingFingerprint.registered_at).toLocaleString()}
            </p>
          </div>
          <button
            className="fp-reg-btn-secondary"
            onClick={handleDeleteExisting}
          >
            🗑️ Delete & Re-register
          </button>
        </div>
      )}

      {/* If not yet registered, show device picker */}
      {!existingFingerprint && (
        <>
          <p>
            Pick the device you're standing in front of. The device will light
            up and ask you to scan your finger.
          </p>

          {error && <div className="error-message">❌ {error}</div>}

          <div className="fp-device-list">
            {devices.length === 0 ? (
              <div className="fp-empty-devices">
                <p>⚠️ No devices registered yet.</p>
                <small>Ask the admin to register a device.</small>
              </div>
            ) : (
              devices.map((device) => (
                <button
                  key={device.id}
                  className={`fp-device-option ${
                    selectedDevice?.id === device.id ? 'selected' : ''
                  } ${!device.is_online ? 'offline' : ''}`}
                  onClick={() => handleChooseDevice(device)}
                  disabled={!device.is_online}
                >
                  <div className="fp-device-icon">
                    {device.is_online ? '🟢' : '🔴'}
                  </div>
                  <div className="fp-device-info">
                    <strong>{device.display_name}</strong>
                    <span className="fp-device-location">
                      {device.location || 'Unknown location'}
                    </span>
                    <span
                      className={`fp-device-status ${
                        device.is_online ? 'online' : 'offline'
                      }`}
                    >
                      {device.is_online ? 'Online' : 'Offline'}
                    </span>
                  </div>
                  {selectedDevice?.id === device.id && (
                    <div className="fp-device-check">✓</div>
                  )}
                </button>
              ))
            )}
          </div>

          <button
            className="fp-reg-btn-primary"
            onClick={handleStartRegistration}
            disabled={!selectedDevice || loading}
          >
            {loading ? '⏳ Sending request...' : '👉 Start Registration'}
          </button>

          {selectedDevice && (
            <p className="fp-reg-hint" style={{ marginTop: '12px' }}>
              Selected: <strong>{selectedDevice.display_name}</strong>
            </p>
          )}
        </>
      )}
    </div>
  );
};

export default FingerprintRegister;

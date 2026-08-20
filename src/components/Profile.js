import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';

const Profile = () => {
  const { user, userData } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [idUrl, setIdUrl] = useState(null);

  useEffect(() => {
    fetchProfile();
  }, [user?.id]);

  const fetchProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', user?.id)
        .single();

      if (error) throw error;
      setProfile(data);

      // Get signed URL for ID document if exists
      if (data.id_document_url) {
        const { data: urlData } = await supabase.storage
          .from('id-documents')
          .createSignedUrl(data.id_document_url, 60);
        setIdUrl(urlData?.signedUrl);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading profile...</div>;
  }

  return (
    <div className="profile-container">
      <h2>My Profile</h2>
      
      <div className="profile-card">
        <div className="profile-field">
          <label>Username</label>
          <p className="username-display">@{profile?.username}</p>
          <small className="form-hint">This is your login username</small>
        </div>
        
        <div className="profile-field">
          <label>Full Name</label>
          <p>{profile?.full_name}</p>
        </div>
        
        <div className="profile-field">
          <label>Role</label>
          <p className="role-badge">{profile?.role}</p>
        </div>
        
        <div className="profile-field">
          <label>Account Status</label>
          <p className={profile?.is_restricted ? 'status-restricted' : 'status-active'}>
            {profile?.is_restricted ? '🔒 Restricted' : '✅ Active'}
          </p>
          {profile?.is_restricted && profile?.restriction_reason && (
            <p className="restriction-reason">{profile.restriction_reason}</p>
          )}
        </div>

        <div className="profile-field">
          <label>Terms Accepted</label>
          <p>{profile?.accepted_terms_at ? 
            new Date(profile.accepted_terms_at).toLocaleString() : 
            'Not accepted'
          }</p>
        </div>

        {idUrl && (
          <div className="profile-field">
            <label>Uploaded ID Document</label>
            <a href={idUrl} target="_blank" rel="noopener noreferrer" className="view-id-link">
              View ID Document
            </a>
          </div>
        )}
      </div>
    </div>
  );
};

export default Profile;
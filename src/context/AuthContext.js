import React, { createContext, useState, useContext, useEffect } from 'react';
import { supabase, getUserRole } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isRestricted, setIsRestricted] = useState(false);
  const navigate = useNavigate();

  const loadUserData = async (userId) => {
    try {
      const data = await getUserRole(userId);
      if (data) {
        setUserData(data);
        setIsAdmin(data.role === 'admin');
        setIsRestricted(data.is_restricted || false);
        console.log('User data loaded:', { role: data.role, isAdmin: data.role === 'admin' });
      } else {
        console.warn('No user data found for ID:', userId);
        setUserData(null);
        setIsAdmin(false);
        setIsRestricted(false);
      }
    } catch (error) {
      console.error('Error loading user data:', error);
      setUserData(null);
      setIsAdmin(false);
      setIsRestricted(false);
    }
  };

  useEffect(() => {
    const getSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setUser(session.user);
          await loadUserData(session.user.id);
        }
      } catch (error) {
        console.error('Error getting session:', error);
      } finally {
        setLoading(false);
      }
    };

    getSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state change:', event, session?.user?.id);
        
        if (session?.user) {
          setUser(session.user);
          await loadUserData(session.user.id);
        } else {
          setUser(null);
          setUserData(null);
          setIsAdmin(false);
          setIsRestricted(false);
        }
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (username, password, fullName, acceptedTerms) => {
    try {
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

      if (authData.user) {
        const { error: userError } = await supabase
          .from('users')
          .insert([
            {
              id: authData.user.id,
              username,
              full_name: fullName,
              role: 'user',
              accepted_terms_at: new Date().toISOString(),
            }
          ]);

        if (userError) {
          if (userError.code === '23505') {
            const { error: signInError } = await supabase.auth.signInWithPassword({
              email,
              password,
            });
            if (signInError) throw signInError;
            return { success: true };
          }
          throw userError;
        }

        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) {
          console.log('Auto sign-in failed:', signInError.message);
        }
      }

      return { success: true };
    } catch (error) {
      console.error('Signup error:', error);
      return { success: false, error: error.message };
    }
  };

  const signIn = async (username, password) => {
    try {
      const email = `${username}@internal.local`;
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          throw new Error('Invalid username or password');
        }
        throw error;
      }

      const userData = await getUserRole(data.user.id);
      if (!userData) {
        await supabase.auth.signOut();
        throw new Error('User account not properly set up.');
      }

      return { success: true, userData };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      setUserData(null);
      setIsAdmin(false);
      setIsRestricted(false);
      navigate('/login');
    } catch (error) {
      console.error('Signout error:', error);
    }
  };

  const value = {
    user,
    userData,
    loading,
    signUp,
    signIn,
    signOut,
    isAdmin,
    isRestricted,
    // For backward compatibility
    get isAdminCheck() { return isAdmin; },
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
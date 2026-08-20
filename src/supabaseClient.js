import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables. Check your .env file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce'
  }
});

// Helper to get user role
export const getUserRole = async (userId) => {
  if (!userId) {
    console.error('No userId provided to getUserRole');
    return null;
  }

  try {
    console.log('Fetching user role for ID:', userId);
    
    const { data, error } = await supabase
      .from('users')
      .select('role, is_restricted, restriction_reason, full_name, accepted_terms_at, username')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error fetching user role:', error);
      
      if (error.code === 'PGRST116') {
        // User not found in users table - create the record
        console.log('User not found in users table, creating record...');
        const { data: authUser } = await supabase.auth.getUser();
        if (authUser?.user) {
          const { error: insertError } = await supabase
            .from('users')
            .insert({
              id: authUser.user.id,
              username: authUser.user.user_metadata?.username || 'user_' + authUser.user.id.slice(0, 8),
              full_name: authUser.user.user_metadata?.full_name || 'User',
              role: 'user',
              accepted_terms_at: new Date().toISOString(),
            });
          
          if (!insertError) {
            // Retry the query
            const { data: retryData, error: retryError } = await supabase
              .from('users')
              .select('role, is_restricted, restriction_reason, full_name, accepted_terms_at, username')
              .eq('id', userId)
              .single();
            
            if (!retryError) {
              console.log('User record created and fetched:', retryData);
              return retryData;
            }
          }
        }
      }
      
      return null;
    }

    console.log('User role fetched successfully:', data);
    return data;
  } catch (error) {
    console.error('Error in getUserRole:', error);
    return null;
  }
};

export const getCurrentUser = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
};
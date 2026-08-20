import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';

const Products = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [duration, setDuration] = useState(30);
  const [idFile, setIdFile] = useState(null);
  const [idPreview, setIdPreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const { user, userData, isRestricted } = useAuth();

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file type
      const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
      if (!validTypes.includes(file.type)) {
        setError('Please upload a valid ID document (JPEG, PNG, GIF, WEBP, PDF)');
        e.target.value = '';
        return;
      }
      
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setError('ID document size should be less than 5MB');
        e.target.value = '';
        return;
      }

      setIdFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setIdPreview(reader.result);
      };
      reader.readAsDataURL(file);
      setError('');
    }
  };

  const handleSubmitRequest = async (e) => {
    e.preventDefault();
    if (isRestricted) {
      setError('🔒 Your account is restricted. You cannot submit new requests.');
      return;
    }

    if (!selectedProduct) {
      setError('Please select a product.');
      return;
    }

    // Check if product is in stock
    if (selectedProduct.quantity <= 0) {
      setError('📦 Sorry, this product is currently out of stock.');
      return;
    }

    if (!idFile) {
      setError('Please upload a valid ID.');
      return;
    }

    if (!userData?.accepted_terms_at) {
      setError('You must accept the Terms & Conditions first.');
      return;
    }

    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      // Upload ID to Supabase Storage
      const fileExt = idFile.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('id-documents')
        .upload(fileName, idFile);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('id-documents')
        .getPublicUrl(fileName);

      // Create request
      const { data: requestData, error: requestError } = await supabase
        .from('requests')
        .insert([
          {
            user_id: user.id,
            product_id: selectedProduct.id,
            duration_minutes: duration,
            id_upload_url: urlData.publicUrl,
            status: 'pending',
          }
        ])
        .select()
        .single();

      if (requestError) throw requestError;

      // Notify admin
      await supabase
        .from('notifications')
        .insert([
          {
            target_role: 'admin',
            type: 'request_submitted',
            message: `📋 New request from ${userData.full_name} for ${selectedProduct.name}`,
            related_request_id: requestData.id,
          }
        ]);

      setSuccess('✅ Request submitted successfully!');
      setSelectedProduct(null);
      setIdFile(null);
      setIdPreview(null);
      
      document.getElementById('id-upload').value = '';

    } catch (error) {
      console.error('Error submitting request:', error);
      setError('Failed to submit request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading products...</p>
      </div>
    );
  }

  return (
    <div className="products-container">
      <div className="products-header">
        <h2>
          🛍️ Browse Products
          <span className="product-count">{products.length} available</span>
        </h2>
      </div>
      
      {error && <div className="error-message">❌ {error}</div>}
      {success && <div className="success-message">✅ {success}</div>}
      
      {isRestricted && (
        <div className="restriction-banner" style={{ marginBottom: '20px' }}>
          <div className="restriction-icon">🔒</div>
          <div className="restriction-content">
            <h3>Account Restricted</h3>
            <p>You cannot submit new requests. Please contact an administrator.</p>
          </div>
        </div>
      )}

      {products.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">🛍️</span>
          <h3>No products available</h3>
          <p>Check back later for new foundation products.</p>
        </div>
      ) : (
        <div className="products-grid">
          {products.map((product) => (
            <div key={product.id} className="product-card">
              <div className="product-image-wrapper">
                {product.image_url ? (
                  <img 
                    src={product.image_url} 
                    alt={product.name} 
                    className="product-image" 
                  />
                ) : (
                  <div className="product-image-placeholder">
                    💄
                    <span>No Image</span>
                  </div>
                )}
                <span className="product-badge">
                  {product.quantity > 0 ? '✅ Available' : '❌ Out of Stock'}
                </span>
              </div>
              <h3>{product.name}</h3>
              <p className="product-description">{product.description || 'No description available'}</p>
              <div className="product-meta">
                <span>📦 {product.quantity > 0 ? `${product.quantity} available` : 'Out of Stock'}</span>
                {product.quantity > 0 && <span>✨ In Stock</span>}
                {product.quantity <= 0 && <span style={{ color: 'var(--error)' }}>❌ Unavailable</span>}
              </div>
              <button 
                className="btn-request"
                onClick={() => setSelectedProduct(product)}
                disabled={isRestricted || product.quantity <= 0}
              >
                {isRestricted ? '🔒 Unavailable' : 
                 product.quantity <= 0 ? '📦 Out of Stock' : 
                 '💄 Request Product'}
              </button>
            </div>
          ))}
        </div>
      )}

      {selectedProduct && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>💄 Request: {selectedProduct.name}</h3>
            <p style={{ color: 'var(--medium-gray)', marginBottom: '16px' }}>
              📦 {selectedProduct.quantity} items available
            </p>
            <form onSubmit={handleSubmitRequest}>
              <div className="form-group">
                <label>⏱️ Duration</label>
                <select 
                  value={duration} 
                  onChange={(e) => setDuration(parseInt(e.target.value))}
                >
                  <option value={30}>30 Minutes</option>
                  <option value={60}>1 Hour</option>
                </select>
                <small className="form-hint">Choose how long you need the product</small>
              </div>

              <div className="form-group">
                <label>🪪 Upload Valid ID</label>
                <div className="file-upload-wrapper" style={{ padding: '16px' }}>
                  <span className="upload-icon">📄</span>
                  <div className="upload-text">
                    <strong>Click to upload</strong> your ID document
                    <br />
                    <small>JPEG, PNG, PDF (max 5MB)</small>
                  </div>
                  <input
                    type="file"
                    id="id-upload"
                    accept="image/*,.pdf"
                    onChange={handleFileChange}
                    required
                  />
                </div>
                {idPreview && (
                  <div className="image-preview-container">
                    <img 
                      src={idPreview} 
                      alt="ID Preview" 
                      className="image-preview" 
                    />
                  </div>
                )}
              </div>

              <div className="modal-actions">
                <button type="button" onClick={() => setSelectedProduct(null)}>
                  Cancel
                </button>
                <button type="submit" disabled={submitting || isRestricted || selectedProduct.quantity <= 0}>
                  {submitting ? '⏳ Submitting...' : '✅ Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Products;
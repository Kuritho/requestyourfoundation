import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';

const ManageProducts = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingProduct, setEditingProduct] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    quantity: 0,
    image_file: null,
    image_url: '',
    image_preview: null,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
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
      const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
      if (!validTypes.includes(file.type)) {
        setError('Please upload a valid image file (JPEG, PNG, GIF, WEBP, SVG)');
        e.target.value = '';
        return;
      }
      
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setError('Image size should be less than 5MB');
        e.target.value = '';
        return;
      }

      setFormData(prev => ({
        ...prev,
        image_file: file,
        image_preview: URL.createObjectURL(file)
      }));
      setError('');
    }
  };

  const removeImage = () => {
    setFormData(prev => ({
      ...prev,
      image_file: null,
      image_preview: null
    }));
    const fileInput = document.getElementById('image-upload');
    if (fileInput) fileInput.value = '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      let imageUrl = formData.image_url;

      if (formData.image_file) {
        const fileExt = formData.image_file.name.split('.').pop();
        const fileName = `${Date.now()}.${fileExt}`;
        const filePath = `products/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('product-images')
          .upload(filePath, formData.image_file);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('product-images')
          .getPublicUrl(filePath);

        imageUrl = urlData.publicUrl;
      }

      const productData = {
        name: formData.name,
        description: formData.description,
        quantity: parseInt(formData.quantity) || 0,
        image_url: imageUrl || null,
        is_active: true,
      };

      if (editingProduct) {
        const { error } = await supabase
          .from('products')
          .update(productData)
          .eq('id', editingProduct.id);

        if (error) throw error;
        setSuccess('✅ Product updated successfully!');
      } else {
        const { error } = await supabase
          .from('products')
          .insert([productData]);

        if (error) throw error;
        setSuccess('✅ Product created successfully!');
      }

      setFormData({ 
        name: '', 
        description: '', 
        quantity: 0,
        image_file: null, 
        image_url: '',
        image_preview: null 
      });
      setEditingProduct(null);
      const fileInput = document.getElementById('image-upload');
      if (fileInput) fileInput.value = '';
      fetchProducts();
    } catch (error) {
      console.error('Error saving product:', error);
      setError('Failed to save product. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      description: product.description || '',
      quantity: product.quantity || 0,
      image_file: null,
      image_url: product.image_url || '',
      image_preview: product.image_url || null,
    });
  };

  const handleCancelEdit = () => {
    setEditingProduct(null);
    setFormData({ 
      name: '', 
      description: '', 
      quantity: 0,
      image_file: null, 
      image_url: '',
      image_preview: null 
    });
    setError('');
    setSuccess('');
    const fileInput = document.getElementById('image-upload');
    if (fileInput) fileInput.value = '';
  };

  const handleToggleActive = async (product) => {
    try {
      const { error } = await supabase
        .from('products')
        .update({ is_active: !product.is_active })
        .eq('id', product.id);

      if (error) throw error;
      fetchProducts();
    } catch (error) {
      console.error('Error toggling product:', error);
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
    <div className="admin-products">
      <div className="admin-header">
        <h2>🛍️ Manage Products</h2>
        <span className="product-count">{products.length} products total</span>
      </div>

      <div className="product-form-container">
        <h3>{editingProduct ? '✏️ Edit Product' : '✨ Add New Product'}</h3>
        {error && <div className="error-message">❌ {error}</div>}
        {success && <div className="success-message">✅ {success}</div>}
        
        <form onSubmit={handleSubmit} className="product-form">
          <div className="form-group">
            <label>📝 Product Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., Maybelline Fit Me Foundation"
              required
            />
          </div>

          <div className="form-group">
            <label>📖 Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Describe the product..."
              rows="3"
            />
          </div>

          <div className="form-group">
            <label>📦 Quantity Available *</label>
            <input
              type="number"
              value={formData.quantity}
              onChange={(e) => setFormData(prev => ({ 
                ...prev, 
                quantity: Math.max(0, parseInt(e.target.value) || 0) 
              }))}
              placeholder="Number of items available"
              min="0"
              required
            />
            <small className="form-hint">Set to 0 if out of stock</small>
          </div>

          <div className="form-group">
            <label>🖼️ Product Image</label>
            <div className="file-upload-wrapper">
              <span className="upload-icon">🖼️</span>
              <div className="upload-text">
                <strong>Click to upload</strong> or drag and drop
                <br />
                <small>PNG, JPG, WEBP, SVG (max 5MB)</small>
              </div>
              <input
                type="file"
                id="image-upload"
                accept="image/*"
                onChange={handleFileChange}
              />
              {formData.image_preview && (
                <div className="file-name">
                  ✅ Image selected
                </div>
              )}
            </div>
            
            {formData.image_preview && (
              <div className="image-preview-container">
                <img 
                  src={formData.image_preview} 
                  alt="Preview" 
                  className="image-preview" 
                />
                <button 
                  type="button" 
                  className="image-preview-remove"
                  onClick={removeImage}
                >
                  ×
                </button>
              </div>
            )}
          </div>

          <div className="form-actions">
            <button type="submit" disabled={submitting}>
              {submitting ? '⏳ Saving...' : (editingProduct ? '💾 Update Product' : '➕ Add Product')}
            </button>
            {editingProduct && (
              <button type="button" onClick={handleCancelEdit}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="products-table-container">
        <h3 style={{ padding: '16px 20px', margin: 0 }}>📦 Product Inventory</h3>
        <table className="products-table">
          <thead>
            <tr>
              <th>Image</th>
              <th>Name</th>
              <th>Description</th>
              <th>Quantity</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id}>
                <td>
                  {product.image_url ? (
                    <img 
                      src={product.image_url} 
                      alt={product.name} 
                      className="product-thumb" 
                    />
                  ) : (
                    <span style={{ fontSize: '24px' }}>🖼️</span>
                  )}
                </td>
                <td><strong>{product.name}</strong></td>
                <td>{product.description || '—'}</td>
                <td>
                  <span style={{ 
                    color: product.quantity > 0 ? 'var(--success)' : 'var(--error)',
                    fontWeight: '600'
                  }}>
                    {product.quantity > 0 ? `✅ ${product.quantity}` : '❌ 0'}
                  </span>
                </td>
                <td>
                  <span className={product.is_active ? 'status-active' : 'status-inactive'}>
                    {product.is_active ? '✅ Active' : '❌ Inactive'}
                  </span>
                </td>
                <td>
                  <div className="action-buttons">
                    <div className="action-row">
                      <button onClick={() => handleEdit(product)}>✏️ Edit</button>
                      <button onClick={() => handleToggleActive(product)}>
                        {product.is_active ? '⏸️ Deactivate' : '▶️ Activate'}
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ManageProducts;
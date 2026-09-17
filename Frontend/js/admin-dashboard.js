(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const ACCOUNT_KEY = 'gunpla.account.v1';
  const PLACEHOLDER = '../images/product-placeholder.svg';
  const API = window.GUNPLA_API_URL || (location.protocol === 'file:' || ['5500', '5501'].includes(location.port) ? 'http://localhost:5000/api' : '/api');
  const money = (value) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value);
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  let account;
  try { account = JSON.parse(localStorage.getItem(ACCOUNT_KEY) || 'null'); } catch { account = null; }
  const token = account?.token || localStorage.getItem('token');
  let user = null;
  let products = [];
  let stores = [];
  let page = 1;
  const pageSize = 8;
  let editing = null;
  let photo = PLACEHOLDER;
  let dirty = false;
  let saving = false;
  let photoLoading = false;
  let photoGeneration = 0;
  let toastTimer;

  function safeImage(value) {
    if (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(value || '')) return value;
    if (/^\.\.\/images\/[\w.-]+\.(png|jpe?g|webp|gif|svg)$/i.test(value || '')) return value;
    try {
      const url = new URL(value);
      if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) return url.href;
    } catch { /* Missing or unsupported photo. */ }
    return PLACEHOLDER;
  }

  async function request(path, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(`${API}${path}`, {
        ...options,
        headers: { Authorization: `Bearer ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
        signal: controller.signal,
        cache: 'no-store'
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(data.message || 'Unable to load the catalog. Please try again.');
        error.status = response.status;
        error.field = data.field;
        throw error;
      }
      return data;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('The request timed out. Refresh the catalog to check whether your changes were saved.');
      if (error instanceof TypeError) throw new Error('Cannot reach the server. Check your connection and try again.');
      throw error;
    } finally { clearTimeout(timeout); }
  }

  function connection(label, state = '') {
    $('connectionStatus').textContent = label;
    $('connectionStatus').className = `connection ${state}`;
  }

  function pageError(message, auth = false) {
    $('pageErrorText').textContent = message;
    $('pageError').hidden = false;
    $('signInLink').hidden = !auth;
    $('retryBtn').hidden = auth;
  }

  function showFormError(error) {
    $('formError').textContent = error.message || error;
    $('formError').hidden = false;
    const field = error.field && $('productForm').elements.namedItem(error.field);
    if (field) field.focus();
    else $('formError').focus();
    $('formError').scrollIntoView({ block: 'nearest' });
  }

  function storeName(id) { return stores.find((store) => store.id === id)?.name || id; }

  function renderStats() {
    $('totalProducts').textContent = products.length.toLocaleString();
    $('totalStock').textContent = products.reduce((sum, product) => sum + product.stock, 0).toLocaleString();
    $('lowStock').textContent = products.filter((product) => product.stock <= 5).length.toLocaleString();
    $('inventoryValue').textContent = money(products.reduce((sum, product) => sum + product.price * product.stock, 0));
    $('productCount').textContent = products.length;
  }

  function renderProducts() {
    const query = $('productSearch').value.trim().toLowerCase();
    const grade = $('gradeFilter').value;
    const status = $('statusFilter').value;
    const filtered = products.filter((product) => `${product.name} ${product.id}`.toLowerCase().includes(query)
      && (!grade || product.grade === grade) && (!status || product.status === status));
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    page = Math.min(page, totalPages);
    const start = (page - 1) * pageSize;
    const rows = filtered.slice(start, start + pageSize);
    const statusClasses = { Available: 'available', 'Low Stock': 'low', 'Out of Stock': 'out', 'Pre-order': 'pre', 'Restock Soon': 'low' };
    $('productRows').innerHTML = rows.map((product) => `
      <tr>
        <td><div class="product-cell"><img src="${escape(safeImage(product.image))}" alt="" loading="lazy"><div><strong>${escape(product.name)}</strong><small>${escape(product.id)}${user.role === 'admin' ? ` · ${escape(storeName(product.storeId))}` : ''}</small></div></div></td>
        <td><span class="grade-badge">${escape(product.grade)}</span><span class="skill-label">${escape(product.skill)}</span></td>
        <td class="price-cell">${money(product.price)}</td>
        <td class="stock-cell">${product.stock.toLocaleString()}<small>units</small></td>
        <td><span class="status-badge ${statusClasses[product.status] || ''}">${escape(product.status)}</span></td>
        <td><button type="button" class="edit-button" data-edit="${escape(product._id)}" aria-label="Edit ${escape(product.name)}">Edit</button></td>
      </tr>`).join('');
    $('tableWrap').hidden = !rows.length;
    $('emptyState').hidden = !!rows.length;
    $('emptyTitle').textContent = products.length ? 'No matching kits.' : 'Make room for the next build.';
    $('emptyText').textContent = products.length ? 'Try another search or clear your filters.' : 'Add your first kit with a photo, price, and stock quantity.';
    $('emptyAddBtn').hidden = !!products.length;
    $('clearFiltersBtn').hidden = !products.length;
    $('resultsSummary').textContent = filtered.length ? `Showing ${start + 1}–${Math.min(start + pageSize, filtered.length)} of ${filtered.length} products` : '0 products';
    $('pageNumber').textContent = `Page ${page} of ${totalPages}`;
    $('previousPage').disabled = page === 1;
    $('nextPage').disabled = page >= totalPages;
  }

  async function loadDashboard() {
    $('pageError').hidden = true;
    $('refreshBtn').disabled = true;
    $('addProductBtn').disabled = true;
    $('catalogLoading').hidden = false;
    $('tableWrap').hidden = true;
    $('emptyState').hidden = true;
    connection('Connecting…');
    try {
      const data = await request('/admin/dashboard');
      user = data.user;
      products = data.products;
      stores = data.stores;
      $('workspaceName').textContent = user.role === 'admin' ? 'All stores' : (user.storeName || 'My store');
      $('workspaceRole').textContent = user.role === 'admin' ? 'Admin workspace' : 'Store owner workspace';
      $('adminUsername').textContent = user.username;
      $('accountRole').textContent = user.role === 'admin' ? 'Administrator' : 'Store owner';
      $('avatar').textContent = user.username.slice(0, 2).toUpperCase();
      $('analyticsLink').hidden = user.role !== 'seller';
      $('catalogScope').textContent = user.role === 'admin' ? `Across all stores · ${data.stats.totalUsers} accounts` : (user.storeName || 'Your store');
      $('dashboardIntro').textContent = user.role === 'admin' ? 'Manage products, photos, and inventory across your store community.' : `Manage products, photos, and inventory for ${user.storeName || 'your store'}.`;
      document.title = `${user.role === 'admin' ? 'Admin' : 'Store'} dashboard | Gunpla Hub`;
      $('addProductBtn').disabled = false;
      renderStats();
      renderProducts();
      connection('Catalog up to date', 'connected');
      $('lastUpdated').textContent = `Last refreshed at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } catch (error) {
      const authError = [401, 403].includes(error.status);
      pageError(authError ? 'Sign in with an admin or store owner account to manage products.' : error.message, authError);
      connection(authError ? 'Sign-in required' : 'Connection unavailable', 'failed');
      $('resultsSummary').textContent = 'Catalog could not be loaded';
    } finally {
      $('catalogLoading').hidden = true;
      $('refreshBtn').disabled = false;
    }
  }

  function resetFilters() {
    ['productSearch', 'gradeFilter', 'statusFilter'].forEach((id) => { $(id).value = ''; });
    page = 1;
  }

  function previewPhoto() {
    $('photoPreview').src = safeImage(photo);
    $('removePhoto').hidden = photo === PLACEHOLDER;
  }

  function openEditor(product = null) {
    if (!user) return;
    editing = product;
    $('productForm').reset();
    $('formError').hidden = true;
    $('editorTitle').textContent = product ? 'Edit product' : 'Add product';
    $('saveProduct').textContent = product ? 'Save changes' : 'Add product';
    $('productName').value = product?.name || '';
    $('productSku').value = product?.id || '';
    $('productSku').required = !!product;
    $('productGrade').value = product?.grade || '';
    $('productSkill').value = product?.skill || 'Beginner';
    $('productPrice').value = product?.price ?? '';
    $('productStock').value = product?.stock ?? 0;
    $('productStatus').value = ['Pre-order', 'Restock Soon'].includes(product?.status) ? product.status : '';
    $('productDescription').value = product?.description || '';
    const choices = [...stores];
    if (product && !choices.some((store) => store.id === product.storeId)) choices.push({ id: product.storeId, name: `${product.storeId} (existing store)` });
    $('productStore').replaceChildren(...choices.map((store) => new Option(store.name, store.id)));
    $('productStore').value = product?.storeId || user.id;
    $('storeField').hidden = user.role !== 'admin';
    $('storeHint').textContent = product && !stores.some((store) => store.id === product.storeId)
      ? 'This product uses a legacy store ID. Select an owner to give them access.' : 'Choose the store that owns this product.';
    photo = product?.image || PLACEHOLDER;
    $('photoUrl').value = /^https?:\/\//.test(photo) ? photo : '';
    $('photoUrlDetails').open = false;
    $('photoFeedback').textContent = 'A clear photo helps builders choose their next kit.';
    previewPhoto();
    photoGeneration++;
    photoLoading = false;
    dirty = false;
    $('productDialog').showModal();
    $('productName').focus();
    $('productDialog').scrollTop = 0;
  }

  function closeEditor() {
    if (saving) return;
    if (dirty && !window.confirm('Discard your unsaved product changes?')) return;
    photoGeneration++;
    dirty = false;
    $('productDialog').close();
  }

  async function uploadPhoto(file) {
    const generation = ++photoGeneration;
    photoLoading = false;
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      $('photoFile').value = '';
      showFormError('Choose a JPG, PNG, or WebP photo under 2 MB.');
      return;
    }
    photoLoading = true;
    $('photoFeedback').textContent = 'Reading photo…';
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Unable to read this photo. Choose another file.'));
        reader.readAsDataURL(file);
      });
      const image = new Image();
      image.src = dataUrl;
      await image.decode();
      if (generation !== photoGeneration) return;
      photo = dataUrl;
      dirty = true;
      $('photoUrl').value = '';
      $('formError').hidden = true;
      $('photoFeedback').textContent = `${file.name} · Ready to save`;
      previewPhoto();
    } catch {
      if (generation === photoGeneration) showFormError('This photo could not be opened. Choose another image.');
    } finally {
      if (generation === photoGeneration) photoLoading = false;
    }
  }

  async function saveProduct(event) {
    event.preventDefault();
    if (saving) return;
    if (photoLoading) return showFormError('Wait for the photo to finish loading, then save.');
    const url = $('photoUrl').value.trim();
    if (url && (!/^https?:\/\//i.test(url) || safeImage(url) === PLACEHOLDER)) return showFormError('Enter a valid http or https photo URL.');
    const payload = {
      name: $('productName').value.trim(), grade: $('productGrade').value, skill: $('productSkill').value,
      price: Number($('productPrice').value), stock: Number($('productStock').value),
      status: $('productStatus').value, image: url || photo,
      description: $('productDescription').value.trim(), storeId: $('productStore').value
    };
    if ($('productSku').value.trim()) payload.id = $('productSku').value.trim();
    if (!payload.name) return showFormError({ message: 'Enter a product name.', field: 'name' });
    saving = true;
    $('formError').hidden = true;
    const controls = [...$('productForm').querySelectorAll('input, select, textarea, button')];
    controls.forEach((control) => { control.disabled = true; });
    $('saveProduct').textContent = 'Saving…';
    try {
      const saved = await request(editing ? `/products/${encodeURIComponent(editing._id)}` : '/products', {
        method: editing ? 'PUT' : 'POST', body: JSON.stringify(payload)
      });
      const index = products.findIndex((product) => product._id === saved._id);
      if (index === -1) products.unshift(saved);
      else products[index] = saved;
      dirty = false;
      $('productDialog').close();
      resetFilters();
      renderStats();
      renderProducts();
      connection('Catalog up to date', 'connected');
      $('lastUpdated').textContent = 'All changes saved to your catalog.';
      $('toast').textContent = `${saved.name} ${editing ? 'updated' : 'added'} successfully.`;
      $('toast').hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { $('toast').hidden = true; }, 5000);
    } catch (error) {
      showFormError(error);
    } finally {
      saving = false;
      controls.forEach((control) => { control.disabled = false; });
      $('saveProduct').textContent = editing ? 'Save changes' : 'Add product';
    }
  }

  $('logoutBtn').addEventListener('click', () => {
    if (saving || (dirty && !window.confirm('Discard unsaved changes and sign out?'))) return;
    [ACCOUNT_KEY, 'token', 'role', 'username'].forEach((key) => localStorage.removeItem(key));
    location.href = 'login.html';
  });
  $('addProductBtn').addEventListener('click', () => openEditor());
  $('emptyAddBtn').addEventListener('click', () => openEditor());
  $('refreshBtn').addEventListener('click', loadDashboard);
  $('retryBtn').addEventListener('click', loadDashboard);
  $('clearFiltersBtn').addEventListener('click', () => { resetFilters(); renderProducts(); });
  ['productSearch', 'gradeFilter', 'statusFilter'].forEach((id) => $(id).addEventListener('input', () => { page = 1; if (user) renderProducts(); }));
  $('previousPage').addEventListener('click', () => { page--; renderProducts(); });
  $('nextPage').addEventListener('click', () => { page++; renderProducts(); });
  $('productRows').addEventListener('click', (event) => {
    const button = event.target.closest('[data-edit]');
    if (button) openEditor(products.find((product) => product._id === button.dataset.edit));
  });
  $('productRows').addEventListener('error', (event) => {
    if (event.target.tagName === 'IMG' && !event.target.src.endsWith('/product-placeholder.svg')) event.target.src = PLACEHOLDER;
  }, true);
  $('photoPreview').addEventListener('error', () => {
    if (!$('photoPreview').src.endsWith('/product-placeholder.svg')) {
      $('photoPreview').src = PLACEHOLDER;
      $('photoFeedback').textContent = 'Photo preview unavailable. Check the URL or upload a photo.';
    }
  });
  $('productForm').addEventListener('input', () => { dirty = true; });
  $('productForm').addEventListener('submit', saveProduct);
  $('closeEditor').addEventListener('click', closeEditor);
  $('cancelEditor').addEventListener('click', closeEditor);
  $('productDialog').addEventListener('cancel', (event) => { event.preventDefault(); closeEditor(); });
  $('photoFile').addEventListener('change', () => uploadPhoto($('photoFile').files[0]));
  $('photoUrl').addEventListener('input', () => {
    photoGeneration++;
    photoLoading = false;
    if ($('photoUrl').value.trim()) { photo = $('photoUrl').value.trim(); $('photoFile').value = ''; }
    else if (/^https?:\/\//i.test(photo)) photo = PLACEHOLDER;
    previewPhoto();
  });
  $('removePhoto').addEventListener('click', () => {
    photoGeneration++;
    photoLoading = false;
    photo = PLACEHOLDER;
    $('photoFile').value = '';
    $('photoUrl').value = '';
    $('photoFeedback').textContent = 'The placeholder will be used after saving.';
    dirty = true;
    previewPhoto();
  });
  window.addEventListener('beforeunload', (event) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });

  if (!token) {
    $('catalogLoading').hidden = true;
    $('refreshBtn').disabled = true;
    pageError('Sign in with an admin or store owner account to manage products.', true);
    connection('Sign-in required', 'failed');
  } else loadDashboard();
})();

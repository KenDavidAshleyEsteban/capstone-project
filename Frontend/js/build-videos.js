(() => {
  'use strict';
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const statuses = { 'awaiting-upload': 'Waiting for file', uploading: 'Uploading', pending: 'Pending admin review', approved: 'Approved', rejected: 'Rejected', failed: 'Upload failed', removed: 'Withdrawn' };
  const objectUrls = new Set();
  const releasePreviews = () => { objectUrls.forEach((url) => URL.revokeObjectURL(url)); objectUrls.clear(); };
  window.addEventListener('pagehide', releasePreviews);
  const date = (value) => new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });

  function client(api, account) {
    return async (path, options = {}) => {
      const response = await fetch(`${api}/build-videos${path}`, {
        ...options, cache: 'no-store', signal: AbortSignal.timeout(options.preview ? 300000 : 20000),
        headers: { ...(account?.token ? { Authorization: `Bearer ${account.token}` } : {}), ...(options.body ? { 'Content-Type': 'application/json' } : {}) }
      });
      if (options.preview && response.ok) return response.blob();
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Unable to load videos. Please try again.');
      return data;
    };
  }

  function cards(videos, api, mode) {
    return videos.map((video) => `<article class="guide-video-card" data-video-id="${escape(video._id)}">
      <div class="build-video-preview">${mode === 'public'
        ? `<video src="${escape(api)}/build-videos/${escape(video._id)}/content" controls preload="metadata" aria-label="${escape(video.title)}"></video>`
        : ['pending', 'approved', 'rejected'].includes(video.status) ? '<button type="button" class="ghost-btn video-preview-btn">Preview video</button>' : `<p>${escape(statuses[video.status])}</p>`}</div>
      <div><div class="card-row"><span class="pill yellow">${escape(video.grade)}</span><span class="pill ${video.status === 'rejected' || video.status === 'failed' ? 'red' : 'green'}">${escape(statuses[video.status])}</span></div>
        <h3>${escape(video.title)}</h3><p>${escape(video.notes)}</p>
        <small>By ${escape(video.builder)} · ${escape(video.role)}<br>Submitted ${escape(date(video.createdAt))} · ${(video.size / 1024 / 1024).toFixed(1)} MB</small>
        ${mode !== 'public' ? `<p class="build-video-file">${escape(video.fileName)}</p>` : ''}
        ${video.reviewedAt ? `<small>${escape(statuses[video.status])} by ${escape(video.reviewer)} on ${escape(date(video.reviewedAt))}</small>` : ''}
        ${video.reviewNote ? `<p class="build-video-review-note">Review note: ${escape(video.reviewNote)}</p>` : ''}
        ${mode === 'review' && video.reviewHistory?.length ? `<details class="video-review-history"><summary>Review history (${video.reviewHistory.length})</summary><ul>${video.reviewHistory.map((review) => `<li>${escape(statuses[review.decision])} by ${escape(review.reviewer)} · ${escape(date(review.at))}${review.note ? `<p>${escape(review.note)}</p>` : ''}</li>`).join('')}</ul></details>` : ''}
        ${mode === 'review' && ['pending', 'approved', 'rejected'].includes(video.status) ? `<form class="video-review-form"><label>Review note<textarea name="note" maxlength="500" placeholder="Required when rejecting a video"></textarea></label><div class="hero-actions"><button type="submit" name="decision" value="approved" class="primary-btn">Approve & publish</button><button type="submit" name="decision" value="rejected" class="ghost-btn">Reject / unpublish</button></div></form>` : ''}
        ${mode === 'mine' ? '<button type="button" class="ghost-btn video-withdraw-btn">Withdraw video</button>' : ''}
        <p class="video-action-status" role="status"></p>
      </div></article>`).join('');
  }

  function bindActions(container, request, reload) {
    container.addEventListener('click', async (event) => {
      const button = event.target.closest('.video-preview-btn, .video-withdraw-btn');
      if (!button) return;
      const card = button.closest('[data-video-id]');
      const status = card.querySelector('.video-action-status');
      button.disabled = true;
      try {
        if (button.matches('.video-preview-btn')) {
          status.textContent = 'Loading private preview…';
          const blob = await request(`/${card.dataset.videoId}/content`, { preview: true });
          const url = URL.createObjectURL(blob);
          objectUrls.add(url);
          const video = document.createElement('video');
          video.controls = true;
          video.preload = 'metadata';
          video.src = url;
          card.querySelector('.build-video-preview').replaceChildren(video);
          status.textContent = '';
        } else {
          await request(`/${card.dataset.videoId}`, { method: 'DELETE' });
          await reload();
        }
      } catch (error) { status.textContent = error.message; button.disabled = false; }
    });
    container.addEventListener('submit', async (event) => {
      const form = event.target.closest('.video-review-form');
      if (!form) return;
      event.preventDefault();
      const card = form.closest('[data-video-id]');
      const status = card.querySelector('.video-action-status');
      const decision = event.submitter?.value;
      const note = form.elements.note.value.trim();
      if (decision === 'rejected' && !note) { status.textContent = 'Add a reason before rejecting this video.'; form.elements.note.focus(); return; }
      const buttons = [...form.querySelectorAll('button')];
      buttons.forEach((button) => { button.disabled = true; });
      try {
        await request(`/${card.dataset.videoId}/review`, { method: 'PATCH', body: JSON.stringify({ decision, note }) });
        await reload();
      } catch (error) { status.textContent = error.message; buttons.forEach((button) => { button.disabled = false; }); }
    });
  }

  function pager(data) {
    return `<div class="video-pagination"><button class="ghost-btn" type="button" data-page="${data.page - 1}" ${data.page <= 1 ? 'disabled' : ''}>Previous</button><span>Page ${data.page} of ${data.pages} · ${data.total} videos</span><button class="ghost-btn" type="button" data-page="${data.page + 1}" ${data.page >= data.pages ? 'disabled' : ''}>Next</button></div>`;
  }

  function uploadFile(api, token, id, file, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', `${api}/build-videos/${id}/content`);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('Content-Type', file.type);
      xhr.timeout = 300000;
      xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100)); };
      xhr.onload = () => {
        let data = {};
        try { data = JSON.parse(xhr.responseText); } catch { /* Show a retry message for non-JSON responses. */ }
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error(data.message || 'The upload failed. Check your uploads before retrying.'));
      };
      xhr.onerror = () => reject(new Error('Connection interrupted. Check your upload status and retry if it failed.'));
      xhr.ontimeout = () => reject(new Error('Upload timed out. Refresh your uploads to check its status.'));
      xhr.onabort = () => reject(new Error('Upload canceled.'));
      xhr.send(file);
    });
  }

  function mountGuide({ api, account }) {
    const request = client(api, account);
    const gallery = document.getElementById('guideVideoGallery');
    const mine = document.getElementById('guideMyUploads');
    const form = document.getElementById('guideVideoForm');
    let publicPage = 1;
    let myPage = 1;
    const loadPublic = async () => {
      try {
        const data = await request(`?page=${publicPage}`);
        gallery.innerHTML = (cards(data.videos, api, 'public') || '<div class="empty">No approved build videos yet.</div>') + pager(data);
      } catch (error) { gallery.innerHTML = `<div class="empty">${escape(error.message)} <button type="button" class="ghost-btn video-retry">Try again</button></div>`; }
    };
    const loadMine = async () => {
      if (!mine || !['buyer', 'seller'].includes(account?.role)) return;
      mine.hidden = false;
      try {
        const data = await request(`/mine?page=${myPage}`);
        mine.innerHTML = `<h3>My uploads</h3><p>Track upload and review status here. Only approved videos appear in the public gallery.</p>${cards(data.videos, api, 'mine') || '<div class="empty">You have no submitted videos.</div>'}${pager(data)}`;
      } catch (error) { mine.innerHTML = `<p role="alert">${escape(error.message)}</p><button type="button" class="ghost-btn video-retry">Refresh my uploads</button>`; }
    };
    gallery.addEventListener('click', (event) => {
      const button = event.target.closest('[data-page], .video-retry');
      if (button) { publicPage = Number(button.dataset.page || publicPage); loadPublic(); }
    });
    mine?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-page], .video-retry');
      if (button) { myPage = Number(button.dataset.page || myPage); loadMine(); }
    });
    if (mine) bindActions(mine, request, async () => { releasePreviews(); await Promise.all([loadMine(), loadPublic()]); });
    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (form.dataset.uploading === 'true') return;
      const file = document.getElementById('guideVideoFile').files[0];
      const status = document.getElementById('guideUploadStatus');
      const progress = document.getElementById('guideUploadProgress');
      if (!file || !['video/mp4', 'video/webm', 'video/ogg'].includes(file.type) || file.size > 100 * 1024 * 1024 || file.size < 12) {
        status.textContent = 'Choose an MP4, WebM, or Ogg video up to 100 MB.';
        return;
      }
      const body = { title: document.getElementById('guideVideoTitle').value.trim() || file.name.replace(/\.[^.]+$/, ''),
        grade: document.getElementById('guideVideoGrade').value, notes: document.getElementById('guideVideoNotes').value.trim(),
        fileName: file.name, size: file.size, type: file.type };
      const controls = [...form.querySelectorAll('button, input, select, textarea')];
      controls.forEach((control) => { control.disabled = true; });
      form.dataset.uploading = 'true';
      progress.hidden = false;
      progress.value = 0;
      status.textContent = 'Preparing upload…';
      try {
        const video = await request('', { method: 'POST', body: JSON.stringify(body) });
        await uploadFile(api, account.token, video.id, file, (value) => {
          progress.value = value;
          status.textContent = value < 100 ? `Uploading: ${value}%` : 'Upload transferred. Saving and checking the file…';
        });
        status.textContent = 'Upload saved. Pending admin approval; it is not public yet.';
        form.reset();
        myPage = 1;
      } catch (error) { status.textContent = error.message; }
      finally {
        progress.hidden = true;
        controls.forEach((control) => { control.disabled = false; });
        form.dataset.uploading = 'false';
        await loadMine();
      }
    });
    Promise.all([loadPublic(), loadMine()]);
  }

  function mountReview({ api, account }) {
    const request = client(api, account);
    const list = document.getElementById('videoReviewList');
    const filter = document.getElementById('videoReviewFilter');
    const status = document.getElementById('videoReviewStatus');
    let page = 1;
    const load = async () => {
      status.textContent = 'Loading upload queue…';
      try {
        const data = await request(`/review?status=${filter.value}&page=${page}`);
        releasePreviews();
        list.innerHTML = (cards(data.videos, api, 'review') || '<div class="empty">No videos with this status.</div>') + pager(data);
        status.textContent = `${data.counts.pending || 0} pending · ${data.counts.approved || 0} approved · ${data.counts.rejected || 0} rejected · ${(data.counts.uploading || 0) + (data.counts['awaiting-upload'] || 0)} awaiting completion · ${data.counts.failed || 0} failed`;
      } catch (error) { status.textContent = error.message; list.innerHTML = '<div class="empty">Could not load the review queue. Check your account and use Refresh.</div>'; }
    };
    filter.addEventListener('change', () => { page = 1; load(); });
    document.getElementById('refreshVideoReview').addEventListener('click', load);
    list.addEventListener('click', (event) => {
      const button = event.target.closest('[data-page]');
      if (button) { page = Number(button.dataset.page); load(); }
    });
    bindActions(list, request, load);
    load();
  }
  window.GUNPLA_BUILD_VIDEOS = { mountGuide, mountReview };
})();

/**
 * Denden Air — Dashboard Controller
 * Manages SSE subscription, SMS/WhatsApp rendering, tabs, stats, device list, and toast notifications.
 */
(function () {
  'use strict';

  // ─── Auth Guard ────────────────────────────────────────────
  const token = localStorage.getItem('denden_token');
  const userRaw = localStorage.getItem('denden_user');

  if (!token || !userRaw) {
    window.location.href = '/';
    return;
  }

  const user = JSON.parse(userRaw);

  // ─── DOM References ────────────────────────────────────────
  const userAvatar = document.getElementById('user-avatar');
  const userEmail = document.getElementById('user-email');
  const btnLogout = document.getElementById('btn-logout');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const smsFeed = document.getElementById('sms-feed');
  const feedEmpty = document.getElementById('feed-empty');
  const feedBadge = document.getElementById('feed-badge');
  const toastContainer = document.getElementById('toast-container');
  const feedTitleText = document.getElementById('feed-title-text');
  const btnDeleteAll = document.getElementById('btn-delete-all');

  // Tabs
  const tabAll = document.getElementById('tab-all');
  const tabSms = document.getElementById('tab-sms');
  const tabWhatsapp = document.getElementById('tab-whatsapp');
  const tabs = [tabAll, tabSms, tabWhatsapp];

  // Stats
  const statMessages = document.getElementById('stat-messages');
  const statDevices = document.getElementById('stat-devices');
  const statLastTime = document.getElementById('stat-last-time');
  const totalMessages = document.getElementById('total-messages');
  const uniqueSenders = document.getElementById('unique-senders');
  const otpCount = document.getElementById('otp-count');

  // Devices
  const deviceList = document.getElementById('device-list');

  // ─── State ─────────────────────────────────────────────────
  let smsEntries = [];
  let senderSet = new Set();
  let otpTotal = 0;
  let eventSource = null;
  let suppressToasts = true;
  let activeTab = 'all'; // 'all', 'sms', 'whatsapp'

  // ─── Toast Grace Period ───────────────────────────────────
  setTimeout(() => {
    suppressToasts = false;
    console.log('[DASHBOARD] Toast notifications enabled');
  }, 5000);

  // ─── Initialize UI ─────────────────────────────────────────
  const initials = user.email ? user.email.substring(0, 2).toUpperCase() : '??';
  userAvatar.textContent = initials;
  userEmail.textContent = user.email;

  // ─── Tab Switching ─────────────────────────────────────────
  const tabTitles = {
    all: '📨 All Messages',
    sms: '📱 SMS Messages',
    whatsapp: '💬 WhatsApp Messages',
  };

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const type = tab.dataset.type;
      if (type === activeTab) return;

      activeTab = type;

      // Update active tab styling
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');

      // Update feed title
      feedTitleText.textContent = tabTitles[type];

      // Filter displayed messages
      filterMessages();
    });
  });

  /**
   * Shows/hides SMS cards based on the active tab filter.
   */
  function filterMessages() {
    const cards = smsFeed.querySelectorAll('.sms-card');
    let visibleCount = 0;

    cards.forEach((card) => {
      const cardType = card.dataset.messageType || 'sms';
      if (activeTab === 'all' || cardType === activeTab) {
        card.style.display = '';
        visibleCount++;
      } else {
        card.style.display = 'none';
      }
    });

    // Show/hide empty state
    if (visibleCount === 0) {
      feedEmpty.classList.remove('hidden');
    } else {
      feedEmpty.classList.add('hidden');
    }
  }

  // ─── Delete All ────────────────────────────────────────────
  btnDeleteAll.addEventListener('click', async () => {
    const typeLabel = activeTab === 'all' ? 'ALL messages' : (activeTab === 'sms' ? 'all SMS messages' : 'all WhatsApp messages');
    const confirmed = confirm(`Are you sure you want to permanently delete ${typeLabel}? This cannot be undone.`);

    if (!confirmed) return;

    try {
      const typeParam = activeTab === 'all' ? '' : `?type=${activeTab}`;
      const res = await fetch(`/api/v1/sms/all${typeParam}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        console.log(`[DASHBOARD] 🗑️ Deleted ${data.deleted_count} message(s)`);

        // Remove cards from DOM
        const cards = smsFeed.querySelectorAll('.sms-card');
        cards.forEach((card) => {
          const cardType = card.dataset.messageType || 'sms';
          if (activeTab === 'all' || cardType === activeTab) {
            card.remove();
          }
        });

        // Rebuild state
        if (activeTab === 'all') {
          smsEntries = [];
          senderSet = new Set();
          otpTotal = 0;
        } else {
          smsEntries = smsEntries.filter((e) => getMessageType(e) !== activeTab);
          senderSet = new Set(smsEntries.map((e) => e.sender_identity));
          otpTotal = smsEntries.filter((e) => /\b\d{4,8}\b/.test(e.message_payload)).length;
        }

        updateGlobalStats();
        filterMessages();
      } else {
        alert('Failed to delete messages. Please try again.');
      }
    } catch (err) {
      console.error('[DASHBOARD] Delete all failed:', err);
      alert('Failed to delete messages. Network error.');
    }
  });

  // ─── Logout ────────────────────────────────────────────────
  btnLogout.addEventListener('click', () => {
    localStorage.removeItem('denden_token');
    localStorage.removeItem('denden_user');
    window.location.href = '/';
  });

  // ─── Fetch Initial Data ────────────────────────────────────
  async function fetchInitialSms() {
    try {
      const res = await fetch('/api/v1/sms?limit=50', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) {
        localStorage.removeItem('denden_token');
        window.location.href = '/';
        return;
      }

      const data = await res.json();

      if (data.sms_logs && data.sms_logs.length > 0) {
        feedEmpty.classList.add('hidden');
        // Render oldest first so newest are on top
        data.sms_logs.reverse().forEach((sms) => {
          addSmsCard(sms, false);
        });
      }
    } catch (err) {
      console.error('[DASHBOARD] Failed to fetch initial SMS:', err);
    }
  }

  async function fetchDevices() {
    try {
      const res = await fetch('/api/v1/devices', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (data.devices && data.devices.length > 0) {
        statDevices.textContent = data.devices.length;
        renderDevices(data.devices);
      }
    } catch (err) {
      console.error('[DASHBOARD] Failed to fetch devices:', err);
    }
  }

  // ─── SSE Connection ────────────────────────────────────────
  function connectSSE() {
    if (eventSource) {
      eventSource.close();
    }

    eventSource = new EventSource(`/api/v1/sms/stream?token=${encodeURIComponent(token)}`);

    eventSource.onopen = () => {
      statusDot.classList.add('connected');
      statusDot.classList.remove('disconnected');
      statusText.textContent = 'Connected';
      feedBadge.classList.remove('hidden');
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'connected') {
          console.log('[SSE] Stream established');
          return;
        }

        if (data.type === 'new_sms') {
          feedEmpty.classList.add('hidden');
          addSmsCard(data.sms, true);
          if (!suppressToasts) {
            showToast(data.sms);
          }
        }
      } catch (err) {
        // Heartbeat comments are not JSON — ignore
      }
    };

    eventSource.onerror = () => {
      statusDot.classList.remove('connected');
      statusDot.classList.add('disconnected');
      statusText.textContent = 'Reconnecting…';

      setTimeout(() => {
        if (eventSource.readyState === EventSource.CLOSED) {
          statusText.textContent = 'Disconnected';
        }
      }, 5000);
    };
  }

  // ─── Message Type Helper ───────────────────────────────────
  /**
   * Determines message type from explicit field or sender prefix.
   */
  function getMessageType(sms) {
    if (sms.message_type) return sms.message_type;
    if (sms.sender_identity && sms.sender_identity.startsWith('[WhatsApp]')) return 'whatsapp';
    return 'sms';
  }

  // ─── SMS Card Rendering ────────────────────────────────────
  function addSmsCard(sms, isNew) {
    smsEntries.push(sms);
    senderSet.add(sms.sender_identity);

    // OTP detection: look for 4-8 digit sequences
    if (/\b\d{4,8}\b/.test(sms.message_payload)) {
      otpTotal++;
    }

    updateGlobalStats(sms);

    const msgType = getMessageType(sms);
    const isWhatsApp = msgType === 'whatsapp';

    const card = document.createElement('div');
    card.className = `sms-card glass-card${isNew ? ' new-entry' : ''}`;
    card.id = `sms-${sms.id}`;
    card.dataset.createdAt = sms.created_at;
    card.dataset.messageType = msgType;

    // Apply tab filter immediately
    if (activeTab !== 'all' && msgType !== activeTab) {
      card.style.display = 'none';
    }

    const senderInitial = sms.sender_identity.replace(/[^a-zA-Z0-9]/g, '').substring(0, 2).toUpperCase() || '??';
    const timeStr = formatTime(sms.created_at);
    const typeIcon = isWhatsApp ? '💬' : '📱';
    const avatarClass = isWhatsApp ? 'sender-avatar whatsapp' : 'sender-avatar';

    card.innerHTML = `
      <div class="sms-card-header">
        <div class="sms-sender">
          <div class="${avatarClass}">${senderInitial}</div>
          <div class="sender-info">
            <span class="sender-name">${escapeHtml(sms.sender_identity)}</span>
            <span class="msg-type-badge ${msgType}">${typeIcon} ${isWhatsApp ? 'WhatsApp' : 'SMS'}</span>
          </div>
        </div>
        <span class="sms-time">${timeStr}</span>
      </div>
      <div class="sms-message">${escapeHtml(sms.message_payload)}</div>
    `;

    // Insert at top of feed
    smsFeed.insertBefore(card, smsFeed.firstChild);

    // Remove "new" glow after 5 seconds
    if (isNew) {
      setTimeout(() => {
        card.classList.remove('new-entry');
      }, 5000);
    }
  }

  // ─── Stats Updates (Global) ────────────────────────────────
  function updateGlobalStats(latestSms) {
    totalMessages.textContent = smsEntries.length;
    statMessages.textContent = smsEntries.length;
    uniqueSenders.textContent = senderSet.size;
    otpCount.textContent = otpTotal;
    if (latestSms) {
      statLastTime.textContent = formatTimeShort(latestSms.created_at);
    } else if (smsEntries.length > 0) {
      statLastTime.textContent = formatTimeShort(smsEntries[smsEntries.length - 1].created_at);
    } else {
      statLastTime.textContent = '—';
    }
  }

  // ─── Device List ───────────────────────────────────────────
  function renderDevices(devices) {
    if (devices.length === 0) {
      deviceList.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">📱</span>
          No devices registered yet
        </div>
      `;
      return;
    }

    deviceList.innerHTML = devices.map((d) => `
      <div class="device-item" id="device-${d.id}">
        <span class="device-name">
          <span class="device-icon">📱</span>
          ${escapeHtml(d.device_label || 'Unnamed Device')}
        </span>
        <button class="btn btn-sm btn-danger device-delete" data-id="${d.id}" title="Remove device">🗑️ Remove</button>
      </div>
    `).join('');

    // Bind delete handlers
    deviceList.querySelectorAll('.device-delete').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const deviceId = btn.dataset.id;
        try {
          const res = await fetch(`/api/v1/devices/${deviceId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const el = document.getElementById(`device-${deviceId}`);
            if (el) el.remove();
            statDevices.textContent = Math.max(0, parseInt(statDevices.textContent) - 1);
          }
        } catch (err) {
          console.error('[DEVICES] Delete failed:', err);
        }
      });
    });
  }

  // ─── Toast Notifications ───────────────────────────────────
  function showToast(sms) {
    const msgType = getMessageType(sms);
    const isWhatsApp = msgType === 'whatsapp';
    const toastIcon = isWhatsApp ? '💬' : '📨';
    const toastLabel = isWhatsApp ? 'WhatsApp' : 'SMS';

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <span class="toast-icon">${toastIcon}</span>
      <div class="toast-content">
        <p class="toast-title">New ${toastLabel} from ${escapeHtml(sms.sender_identity)}</p>
        <p class="toast-body">${formatTimeShort(sms.created_at)}</p>
      </div>
      <button class="toast-close">✕</button>
    `;

    toast.querySelector('.toast-close').addEventListener('click', () => {
      toast.remove();
    });

    toastContainer.appendChild(toast);

    // Auto-remove after 6 seconds
    setTimeout(() => {
      if (toast.parentNode) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        toast.style.transition = 'all 0.3s ease-out';
        setTimeout(() => toast.remove(), 300);
      }
    }, 6000);
  }

  // ─── Utility Functions ─────────────────────────────────────
  function formatTime(dateStr) {
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      return date.toLocaleString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  }

  function formatTimeShort(dateStr) {
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return '—';
      const now = new Date();
      const diffMs = now - date;
      const diffSec = Math.floor(diffMs / 1000);

      if (diffSec < 5) return 'Just now';
      if (diffSec < 60) return `${diffSec}s ago`;
      if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch {
      return '—';
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ─── Bootstrap ─────────────────────────────────────────────
  fetchInitialSms();
  fetchDevices();
  connectSSE();

  // Initialize QR sync if available
  if (typeof window.initQrSync === 'function') {
    window.initQrSync(token);
  }
})();

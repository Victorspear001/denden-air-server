/**
 * Denden Air — QR Code Session Sync
 * Generates ephemeral tokens encoded as QR codes for device linking.
 * Uses qrcode.min.js included in dashboard.html.
 */

window.initQrSync = function (jwt) {
  const container = document.getElementById('qrcode-container');
  const timerEl = document.getElementById('qr-timer');

  if (!container || !timerEl) return;

  const REFRESH_INTERVAL = 120; // 2 minutes in seconds
  let countdown = REFRESH_INTERVAL;
  let currentToken = '';
  let qrCode = null;

  function generateEphemeralToken() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10);
    return `dda_${timestamp}_${random}`;
  }

  function refreshQR() {
    currentToken = generateEphemeralToken();
    countdown = REFRESH_INTERVAL;

    const payload = JSON.stringify({
      server_url: window.location.origin,
      token: jwt,
      ephemeral: currentToken,
      expires: Date.now() + REFRESH_INTERVAL * 1000,
    });

    if (qrCode) {
      qrCode.clear();
      qrCode.makeCode(payload);
    } else {
      container.innerHTML = '';
      qrCode = new QRCode(container, {
        text: payload,
        width: 160,
        height: 160,
        colorDark : "#000000",
        colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.M
      });
      // Style it a bit to center it
      const img = container.querySelector('img');
      const canvas = container.querySelector('canvas');
      if (img) {
        img.style.margin = '0 auto';
        img.style.borderRadius = '8px';
      }
      if (canvas) {
        canvas.style.margin = '0 auto';
        canvas.style.borderRadius = '8px';
      }
    }
  }

  function updateTimer() {
    countdown--;
    if (countdown <= 0) {
      refreshQR();
    }

    const mins = Math.floor(countdown / 60);
    const secs = countdown % 60;
    timerEl.textContent = `Refreshes in ${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // Initial render
  refreshQR();

  // Update timer every second
  setInterval(updateTimer, 1000);
};

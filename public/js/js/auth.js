/**
 * Denden Air — Client Authentication Controller
 * Handles login/register form switching, submission, and JWT storage.
 */
(function () {
  'use strict';

  // ─── DOM References ────────────────────────────────────────
  const form = document.getElementById('auth-form');
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const confirmGroup = document.getElementById('confirm-group');
  const inputEmail = document.getElementById('input-email');
  const inputPassword = document.getElementById('input-password');
  const inputConfirm = document.getElementById('input-confirm');
  const btnText = document.getElementById('btn-text');
  const btnSpinner = document.getElementById('btn-spinner');
  const btnSubmit = document.getElementById('btn-submit');
  const alertError = document.getElementById('alert-error');
  const alertSuccess = document.getElementById('alert-success');

  let mode = 'login'; // 'login' | 'register'

  // ─── Redirect if already authenticated ─────────────────────
  const existingToken = localStorage.getItem('denden_token');
  if (existingToken) {
    window.location.href = '/dashboard.html';
  }

  // ─── Tab Switching ─────────────────────────────────────────
  tabLogin.addEventListener('click', () => switchMode('login'));
  tabRegister.addEventListener('click', () => switchMode('register'));

  function switchMode(newMode) {
    mode = newMode;
    hideAlerts();

    if (mode === 'login') {
      tabLogin.classList.add('active');
      tabRegister.classList.remove('active');
      confirmGroup.classList.add('hidden');
      inputConfirm.removeAttribute('required');
      btnText.textContent = 'Sign In';
      inputPassword.setAttribute('autocomplete', 'current-password');
    } else {
      tabRegister.classList.add('active');
      tabLogin.classList.remove('active');
      confirmGroup.classList.remove('hidden');
      inputConfirm.setAttribute('required', '');
      btnText.textContent = 'Create Account';
      inputPassword.setAttribute('autocomplete', 'new-password');
    }
  }

  // ─── Form Submission ───────────────────────────────────────
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlerts();

    const email = inputEmail.value.trim();
    const password = inputPassword.value;

    // Client-side validation
    if (!email || !password) {
      showError('Please fill in all fields.');
      return;
    }

    if (mode === 'register') {
      if (password.length < 8) {
        showError('Password must be at least 8 characters.');
        return;
      }
      if (password !== inputConfirm.value) {
        showError('Passwords do not match.');
        return;
      }
    }

    // Set loading state
    setLoading(true);

    try {
      const endpoint = mode === 'login' ? '/api/v1/login' : '/api/v1/register';

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        showError(data.message || 'An error occurred. Please try again.');
        return;
      }

      // Store token and user data
      localStorage.setItem('denden_token', data.token);
      localStorage.setItem('denden_user', JSON.stringify(data.user));

      showSuccess(mode === 'login' ? 'Login successful! Redirecting…' : 'Account created! Redirecting…');

      // Redirect to dashboard after brief delay
      setTimeout(() => {
        window.location.href = '/dashboard.html';
      }, 800);

    } catch (err) {
      console.error('[AUTH] Network error:', err);
      showError('Network error. Please check your connection.');
    } finally {
      setLoading(false);
    }
  });

  // ─── UI Helpers ────────────────────────────────────────────
  function showError(msg) {
    alertError.textContent = msg;
    alertError.classList.add('show');
    alertSuccess.classList.remove('show');
  }

  function showSuccess(msg) {
    alertSuccess.textContent = msg;
    alertSuccess.classList.add('show');
    alertError.classList.remove('show');
  }

  function hideAlerts() {
    alertError.classList.remove('show');
    alertSuccess.classList.remove('show');
  }

  function setLoading(loading) {
    if (loading) {
      btnSubmit.disabled = true;
      btnText.classList.add('hidden');
      btnSpinner.classList.remove('hidden');
    } else {
      btnSubmit.disabled = false;
      btnText.classList.remove('hidden');
      btnSpinner.classList.add('hidden');
    }
  }
})();

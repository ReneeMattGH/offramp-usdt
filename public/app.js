const API = '/api';
let token = localStorage.getItem('token') || '';

const els = {
  phoneNumber: document.getElementById('phoneNumber'),
  accountNumber: document.getElementById('accountNumber'),
  otp: document.getElementById('otp'),
  sendOtpBtn: document.getElementById('sendOtpBtn'),
  loginBtn: document.getElementById('loginBtn'),
  name: document.getElementById('name'),
  ifsc: document.getElementById('ifsc'),
  referral: document.getElementById('referral'),
  signupBtn: document.getElementById('signupBtn'),
  authStatus: document.getElementById('authStatus'),
  dashboard: document.getElementById('dashboard'),
  genAddrBtn: document.getElementById('genAddrBtn'),
  addrResult: document.getElementById('addrResult'),
  rate: document.getElementById('rate'),
  usdtAmount: document.getElementById('usdtAmount'),
  bankAcc: document.getElementById('bankAcc'),
  bankIfsc: document.getElementById('bankIfsc'),
  bankName: document.getElementById('bankName'),
  createOrderBtn: document.getElementById('createOrderBtn'),
  orders: document.getElementById('orders'),
  balance: document.getElementById('balance'),
  kyc: document.getElementById('kyc'),
  kycStatusBtn: document.getElementById('kycStatusBtn'),
  kycStatus: document.getElementById('kycStatus'),
  aadhaar: document.getElementById('aadhaar'),
  fullName: document.getElementById('fullName'),
  dob: document.getElementById('dob'),
  aadhaarImg: document.getElementById('aadhaarImg'),
  submitKycBtn: document.getElementById('submitKycBtn'),
  kycSubmitStatus: document.getElementById('kycSubmitStatus'),
};

function setStatus(target, msg) {
  target.textContent = msg;
}

async function api(path, method = 'GET', body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return res.json();
}

function showApp() {
  document.getElementById('auth-section').classList.add('hidden');
  els.dashboard.classList.remove('hidden');
  els.kyc.classList.remove('hidden');
  startStreams();
  refreshRate();
}

// Auth
els.sendOtpBtn.onclick = async () => {
  try {
    await api('/auth/send-otp', 'POST', { phoneNumber: els.phoneNumber.value.trim() });
    setStatus(els.authStatus, 'OTP sent');
  } catch (e) {
    setStatus(els.authStatus, `Error: ${e.message}`);
  }
};

els.loginBtn.onclick = async () => {
  try {
    const data = await api('/auth/login', 'POST', {
      phoneNumber: els.phoneNumber.value.trim(),
      otp: els.otp.value.trim(),
    });
    token = data.token;
    localStorage.setItem('token', token);
    setStatus(els.authStatus, 'Logged in');
    showApp();
  } catch (e) {
    setStatus(els.authStatus, `Login error: ${e.message}`);
  }
};

els.signupBtn.onclick = async () => {
  try {
    const data = await api('/auth/signup', 'POST', {
      accountHolderName: els.name.value.trim(),
      phoneNumber: els.phoneNumber.value.trim(),
      accountNumber: els.accountNumber.value.trim(),
      ifscCode: els.ifsc.value.trim(),
      otp: els.otp.value.trim(),
      referralCode: els.referral.value.trim() || undefined,
    });
    token = data.token;
    localStorage.setItem('token', token);
    setStatus(els.authStatus, 'Signed up and logged in');
    showApp();
  } catch (e) {
    setStatus(els.authStatus, `Signup error: ${e.message}`);
  }
};

// Wallet
els.genAddrBtn.onclick = async () => {
  try {
    const data = await api('/wallet/generate-address', 'POST');
    els.addrResult.textContent = `Address: ${data.tronAddress}, Expires: ${data.expiresAt}`;
  } catch (e) {
    els.addrResult.textContent = `Error: ${e.message}`;
  }
};

// Exchange
async function refreshRate() {
  try {
    const data = await api('/exchange/rate', 'GET');
    els.rate.textContent = `₹ ${data.rate}`;
  } catch (e) {
    els.rate.textContent = `Error: ${e.message}`;
  }
}

els.createOrderBtn.onclick = async () => {
  try {
    const body = {
      usdtAmount: Number(els.usdtAmount.value),
      bankDetails: {
        account_number: els.bankAcc.value.trim(),
        ifsc: els.bankIfsc.value.trim(),
        account_holder_name: els.bankName.value.trim(),
      },
    };
    const data = await api('/exchange/create-order', 'POST', body);
    alert(`Order created: ${data.id || 'OK'}`);
  } catch (e) {
    alert(`Order error: ${e.message}`);
  }
};

// KYC
els.kycStatusBtn.onclick = async () => {
  try {
    const data = await api('/kyc/status', 'GET');
    els.kycStatus.textContent = `Status: ${data.kyc_status} (Verified at: ${data.kyc_verified_at || '—'})`;
  } catch (e) {
    els.kycStatus.textContent = `Error: ${e.message}`;
  }
};

els.submitKycBtn.onclick = async () => {
  try {
    const formData = new FormData();
    formData.append('aadhaar_number', els.aadhaar.value.trim());
    formData.append('full_name', els.fullName.value.trim());
    formData.append('dob', els.dob.value.trim());
    if (els.aadhaarImg.files[0]) {
      formData.append('aadhaar_image', els.aadhaarImg.files[0]);
    }
    const res = await fetch(`${API}/kyc/verify-kyc`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || res.statusText);
    setStatus(els.kycSubmitStatus, json.message || 'Submitted');
  } catch (e) {
    setStatus(els.kycSubmitStatus, `Error: ${e.message}`);
  }
};

// Real-time streams (SSE with polling fallback)
function startStreams() {
  // Balance stream
  try {
    const esBal = new EventSource(`${API}/stream/balance`, { withCredentials: false });
    esBal.addEventListener('balance', (ev) => {
      const data = JSON.parse(ev.data);
      els.balance.textContent = `Available: ${data.available_balance ?? data.available}, Locked: ${data.locked_balance ?? data.locked}`;
    });
    esBal.addEventListener('error', () => {
      // Fallback to polling
      pollBalance();
    });
  } catch {
    pollBalance();
  }

  // Orders stream
  try {
    const esOrders = new EventSource(`${API}/stream/orders`, { withCredentials: false });
    esOrders.addEventListener('orders', (ev) => {
      const list = JSON.parse(ev.data) || [];
      els.orders.innerHTML = list.map(o => `<li>${o.id || ''} - ${o.status || ''} - ₹${o.inr_amount || ''}</li>`).join('');
    });
    esOrders.addEventListener('error', () => {
      pollOrders();
    });
  } catch {
    pollOrders();
  }
}

async function pollBalance() {
  try {
    const data = await api('/wallet/balance', 'GET');
    els.balance.textContent = `Available: ${data.available_balance ?? data.available}, Locked: ${data.locked_balance ?? data.locked}`;
  } catch (e) {
    els.balance.textContent = `Error: ${e.message}`;
  } finally {
    setTimeout(pollBalance, 5000);
  }
}

async function pollOrders() {
  try {
    const list = await api('/exchange/orders', 'GET');
    els.orders.innerHTML = list.map(o => `<li>${o.id || ''} - ${o.status || ''} - ₹${o.inr_amount || ''}</li>`).join('');
  } catch (e) {
    els.orders.innerHTML = `<li>Error: ${e.message}</li>`;
  } finally {
    setTimeout(pollOrders, 5000);
  }
}

// Auto-resume if already logged in
if (token) {
  showApp();
}


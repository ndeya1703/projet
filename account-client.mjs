const SESSION_KEY = 'marchea-account-session';

export function isPublicConfig(config) {
  try {
    const url = new URL(config.url);
    if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname) || url.username || url.password || url.port || url.pathname !== '/') return false;
    const key = config.publishableKey;
    if (typeof key !== 'string') return false;
    if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true;
    const payload = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.role === 'anon';
  } catch { return false; }
}

export function normalizeItems(items) {
  if (!Array.isArray(items)) return [];
  const result = new Map();
  for (const item of items.slice(0, 100)) {
    const p = item?.product;
    if (!p || typeof p.id !== 'string' || !p.id || p.id.length > 100 || typeof p.name !== 'string' || typeof p.store !== 'string' || !Number.isFinite(p.price) || p.price <= 0 || p.price > 100000 || !['Maison', 'Mode', 'Beauté'].includes(p.category) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 999) continue;
    const image = typeof p.image === 'string' && ( /^photo-[a-zA-Z0-9-]+$/.test(p.image) || (/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(p.image) && p.image.length < 500000)) ? p.image : null;
    result.set(p.id, { product: { id: p.id, name: p.name.slice(0, 90), store: p.store.slice(0, 60), price: p.price, category: p.category, description: typeof p.description === 'string' ? p.description.slice(0, 500) : '', image }, quantity: item.quantity });
  }
  return [...result.values()];
}

export function mergeItems(remote, guest) {
  const result = new Map(normalizeItems(remote).map(item => [item.product.id, item]));
  for (const item of normalizeItems(guest)) {
    const existing = result.get(item.product.id);
    result.set(item.product.id, { product: existing?.product || item.product, quantity: Math.max(existing?.quantity || 0, item.quantity) });
  }
  return [...result.values()].slice(0, 100);
}

export class AccountClient {
  constructor(config, { fetchImpl = globalThis.fetch, storage = null } = {}) {
    this.config = config;
    this.fetch = fetchImpl;
    this.storage = storage;
    this.session = null;
    this.refreshing = null;
    this.expired = false;
  }
  get configured() { return isPublicConfig(this.config); }
  get user() { return this.session?.user || null; }
  async request(path, { token, body, method = 'GET', headers = {} } = {}) {
    if (!this.configured) throw new Error('Les comptes clients ne sont pas encore activés.');
    let response;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      response = await this.fetch(`${this.config.url.replace(/\/$/, '')}${path}`, {
        method,
        headers: { apikey: this.config.publishableKey, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      });
    } catch (cause) {
      const error = new Error(controller.signal.aborted ? 'Le service met trop de temps à répondre. Réessayez dans quelques instants.' : 'Connexion impossible. Vérifiez votre connexion puis réessayez.');
      error.code = 'connection_unavailable';
      throw error;
    } finally { clearTimeout(timeout); }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const code = data?.error_code || (typeof data?.code === 'string' ? data.code : '');
      const messages = {
        email_not_confirmed: 'Confirmez votre adresse e-mail avant de vous connecter.',
        email_address_not_authorized: 'L’envoi des confirmations n’est pas encore configuré pour cette adresse. Contactez la boutique.',
        email_address_invalid: 'Vérifiez votre adresse e-mail.',
        over_email_send_rate_limit: 'La limite d’envoi des e-mails est atteinte. Patientez avant de demander un nouveau lien.',
        signup_disabled: 'Les inscriptions sont temporairement indisponibles. Contactez la boutique.',
        email_provider_disabled: 'Les inscriptions par e-mail ne sont pas encore disponibles. Contactez la boutique.',
        weak_password: 'Choisissez un mot de passe plus fort respectant les exigences de la boutique.',
      };
      const senderFailure = /error sending confirmation email/i.test(data?.msg || data?.message || '');
      const message = messages[code] || (response.status === 429 ? 'Trop de tentatives. Patientez avant de réessayer.' : senderFailure ? 'Le service d’envoi des confirmations est indisponible. Réessayez plus tard ou contactez la boutique.' : path.startsWith('/auth/v1/token?grant_type=password') ? 'Adresse e-mail ou mot de passe incorrect, ou adresse non confirmée.' : path.startsWith('/rest/') ? 'Impossible de synchroniser votre panier. Réessayez dans quelques instants.' : 'Impossible de terminer cette opération. Vérifiez les informations saisies et réessayez.');
      const error = new Error(message);
      error.code = code;
      error.status = response.status;
      throw error;
    }
    return data;
  }
  setSession(data) {
    if (!data?.access_token || !data.refresh_token || !data.user?.id) throw new Error('La connexion n’a pas pu être confirmée. Réessayez.');
    this.expired = false;
    this.session = { access_token: data.access_token, refresh_token: data.refresh_token, user: data.user, expires_at: Date.now() + (data.expires_in || 3600) * 1000 };
    try { this.storage?.setItem(SESSION_KEY, data.refresh_token); } catch { /* La session reste disponible en mémoire. */ }
  }
  clearSession() {
    this.session = null;
    this.expired = false;
    try { this.storage?.removeItem(SESSION_KEY); } catch { /* Stockage indisponible. */ }
  }
  async signUp(email, password, name) {
    const data = await this.request('/auth/v1/signup', { method: 'POST', body: { email, password, data: { full_name: name } } });
    if (data?.access_token) this.setSession(data);
    return Boolean(this.session);
  }
  async checkConnection() {
    const settings = await this.request('/auth/v1/settings');
    return { emailEnabled: settings?.external?.email === true, confirmationRequired: settings?.mailer_autoconfirm === false };
  }
  async resendConfirmation(email) {
    await this.request('/auth/v1/resend', { method: 'POST', body: { type: 'signup', email } });
  }
  async signIn(email, password) {
    this.setSession(await this.request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } }));
  }
  async restore() {
    let token;
    try { token = this.storage?.getItem(SESSION_KEY); } catch { return false; }
    if (!token) return false;
    await this.refresh(token);
    return true;
  }
  async refresh(token = this.session?.refresh_token) {
    if (!token) throw new Error('Reconnectez-vous pour retrouver votre panier.');
    if (!this.refreshing) this.refreshing = this.request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: token } }).then(data => this.setSession(data)).catch(error => {
      if ([400, 401, 403].includes(error.status)) {
        const previousUser = this.user;
        this.clearSession();
        if (previousUser) { this.session = { user: previousUser, refresh_token: null, access_token: null, expires_at: 0 }; this.expired = true; }
        error.message = 'Votre session a expiré. Reconnectez-vous pour enregistrer votre panier.';
      }
      throw error;
    }).finally(() => { this.refreshing = null; });
    await this.refreshing;
  }
  async authenticated(path, options = {}) {
    if (!this.session) throw new Error('Reconnectez-vous pour retrouver votre panier.');
    if (this.session.expires_at - Date.now() < 60000) await this.refresh();
    try { return await this.request(path, { ...options, token: this.session.access_token }); }
    catch (error) {
      if (error.status !== 401) throw error;
      await this.refresh();
      return this.request(path, { ...options, token: this.session.access_token });
    }
  }
  async loadCart() {
    if (!this.user) throw new Error('Connectez-vous pour retrouver votre panier.');
    const rows = await this.authenticated(`/rest/v1/customer_carts?user_id=eq.${encodeURIComponent(this.user.id)}&select=items`);
    return normalizeItems(rows?.[0]?.items || []);
  }
  async saveCart(items) {
    if (!this.user) throw new Error('Connectez-vous pour enregistrer votre panier.');
    if (items.length > 100) throw new Error('Votre panier peut contenir 100 produits différents maximum.');
    const normalized = normalizeItems(items);
    if (JSON.stringify(normalized).length > 2000000) throw new Error('Votre panier contient trop de photos. Retirez quelques articles pour le synchroniser.');
    await this.authenticated('/rest/v1/customer_carts?on_conflict=user_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: { user_id: this.user.id, items: normalized, updated_at: new Date().toISOString() } });
  }
  async signOut() {
    try {
      if (this.session && !this.expired) await this.authenticated('/auth/v1/logout?scope=local', { method: 'POST' });
    } finally { this.clearSession(); }
  }
}

import { sb } from '../supabase';
import { config } from '../config';
import { t } from '../i18n';
import { html, mount, $, onAction, busy, inputValue, raw, type Raw } from '../lib/dom';
import { go } from '../lib/router';
import { toast } from '../lib/ui';
import { friendlyAuthError, friendlyError } from '../lib/errors';
import { validateEmail, validatePassword } from '../lib/validation';
import { logo } from '../lib/logo';
import { enabledProviders, signInWith, PROVIDER_LABEL, type OAuthProvider } from '../lib/oauth';
import { acceptTerms } from '../lib/api';
import { state } from '../state';

function redirectUrl(): string | undefined {
  // Los enlaces del correo abren la versión web pública (funciona desde cualquier teléfono).
  return config.publicWebUrl || undefined;
}

/** Botones de ingreso social: solo los proveedores realmente configurados. */
function socialButtons(): Raw {
  const providers = enabledProviders();
  if (!providers.length) return raw('');
  return html`${providers.map((p) => html`
    <button type="button" class="btn btn-lg btn-social ${p === 'facebook' ? 'btn-facebook' : ''}" data-action="oauth" data-provider="${p}">${PROVIDER_LABEL[p]}</button>`)}
    <div class="divider">o con tu correo</div>`;
}

function bindSocial(root: HTMLElement): void {
  onAction(root, {
    oauth: (btn) => void busy(btn, async () => {
      try { await signInWith(btn.dataset.provider as OAuthProvider); } catch (e) { toast(friendlyAuthError(e), 'error'); }
    }),
    pw: (btn) => {
      const input = btn.parentElement?.querySelector('input') as HTMLInputElement | null;
      if (!input) return;
      input.type = input.type === 'password' ? 'text' : 'password';
      btn.textContent = input.type === 'password' ? '👁️' : '🙈';
      btn.setAttribute('aria-label', input.type === 'password' ? 'Mostrar contraseña' : 'Ocultar contraseña');
    },
  });
}

function field(id: string, label: string, icon: string, type = 'text', extra: Raw = raw('')): Raw {
  const isPw = type === 'password';
  return html`<label class="label" for="${id}">${label}</label>
    <div class="input-icon"><span aria-hidden="true">${icon}</span>
      <input class="input" id="${id}" type="${type}" ${extra} />
      ${isPw ? html`<button type="button" class="pw-toggle" data-action="pw" aria-label="Mostrar contraseña">👁️</button>` : ''}
    </div>`;
}

function hero(compact: boolean, title?: string): Raw {
  return html`<div class="hero-top" style="${compact ? 'flex:0 0 auto;padding-bottom:28px' : ''}">
    ${logo({ size: compact ? 44 : 72 })}
    ${title ? html`<h1>${title}</h1>` : ''}
  </div>`;
}

export function renderWelcome(root: HTMLElement): void {
  mount(root, html`
    <section class="hero">
      <div class="hero-top">
        ${logo({ size: 76 })}
        <h1>${t('tagline')}</h1>
        <p class="sub">Pregunta a personas que están en el lugar y recibe fotos y respuestas antes de salir.</p>
        <div class="hero-chips"><span>🏦 ¿Hay fila?</span><span>🏪 ¿Está abierto?</span><span>🏥 ¿Cuánta espera?</span><span>🏖️ ¿Cómo está la playa?</span></div>
      </div>
      <div class="sheet">
        ${socialButtons()}
        <a class="btn btn-primary btn-lg" href="#/registro">✉️ ${t('welcomeSignup')}</a>
        <a class="btn btn-secondary btn-lg" href="#/ingresar">${t('welcomeLogin')}</a>
        <p class="legal-note"><a href="#/historia">💚 Nuestra historia</a> · Piloto en La Araucanía · <a href="#/legal/privacidad">${t('privacy')}</a></p>
      </div>
    </section>`);
  bindSocial(root);
}

export function renderLogin(root: HTMLElement): void {
  mount(root, html`
    <section class="hero">
      ${hero(true)}
      <div class="sheet">
        <h2>${t('loginTitle')}</h2>
        ${socialButtons()}
        <form id="f" novalidate class="stack">
          ${field('email', t('email'), '✉️', 'email', raw('autocomplete="email" inputmode="email" required'))}
          ${field('pw', t('password'), '🔒', 'password', raw('autocomplete="current-password" required'))}
          <p class="field-error" id="err" role="alert" hidden></p>
          <button class="btn btn-primary btn-lg" type="submit">${t('login')}</button>
        </form>
        <div class="auth-links"><a href="#/recuperar">${t('forgot')}</a><a href="#/registro">Crear cuenta</a></div>
      </div>
    </section>`);
  bindSocial(root);
  const form = $('#f', root) as HTMLFormElement;
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const err = $('#err', root);
    const email = inputValue('#email', root).trim();
    const password = inputValue('#pw', root);
    if (!validateEmail(email)) { err.hidden = false; err.textContent = t('invalidEmail'); return; }
    void busy(form.querySelector('button[type="submit"]'), async () => {
      const { error } = await sb().auth.signInWithPassword({ email, password });
      if (error) { err.hidden = false; err.textContent = friendlyAuthError(error); return; }
      go('/explorar', true);
    });
  });
}

export function renderSignup(root: HTMLElement): void {
  mount(root, html`
    <section class="hero">
      ${hero(true)}
      <div class="sheet">
        <h2>${t('signupTitle')}</h2>
        ${socialButtons()}
        <form id="f" novalidate class="stack">
          ${field('name', t('displayName'), '👤', 'text', raw('maxlength="40" autocomplete="nickname" required'))}
          ${field('email', t('email'), '✉️', 'email', raw('autocomplete="email" inputmode="email" required'))}
          ${field('pw', `${t('password')} (mín. 8)`, '🔒', 'password', raw('autocomplete="new-password" minlength="8" required'))}
          ${field('pw2', t('passwordRepeat'), '🔒', 'password', raw('autocomplete="new-password" minlength="8" required'))}
          <label class="check">
            <input type="checkbox" id="terms" />
            <span>${t('acceptTermsLabel')} <a href="#/legal/terminos">${t('terms')}</a> ${t('and')} <a href="#/legal/privacidad">${t('privacy')}</a>.</span>
          </label>
          <p class="field-error" id="err" role="alert" hidden></p>
          <button class="btn btn-primary btn-lg" type="submit">${t('signup')}</button>
        </form>
        <div class="auth-links"><span></span><a href="#/ingresar">${t('haveAccount')}</a></div>
      </div>
    </section>`);
  bindSocial(root);
  const form = $('#f', root) as HTMLFormElement;
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const err = $('#err', root);
    const show = (m: string) => { err.hidden = false; err.textContent = m; };
    const name = inputValue('#name', root).trim();
    const email = inputValue('#email', root).trim();
    const pw = inputValue('#pw', root);
    const pw2 = inputValue('#pw2', root);
    if (name.length < 2) return show('Escribe tu nombre (mínimo 2 caracteres).');
    if (!validateEmail(email)) return show(t('invalidEmail'));
    if (!validatePassword(pw)) return show(t('weakPassword'));
    if (pw !== pw2) return show(t('passwordsDiffer'));
    if (!($('#terms', root) as HTMLInputElement).checked) return show(t('mustAcceptTerms'));
    void busy(form.querySelector('button[type="submit"]'), async () => {
      const { data, error } = await sb().auth.signUp({
        email, password: pw,
        options: { data: { display_name: name, accepted_terms: 'true' }, emailRedirectTo: redirectUrl() },
      });
      if (error) return show(friendlyAuthError(error));
      if (data.session) { go('/explorar', true); return; }
      mount(root, html`<section class="hero">${hero(false, '📧 Revisa tu correo')}<div class="sheet"><p>${t('checkEmail')}</p>
        <a class="btn btn-primary btn-lg" href="#/ingresar">${t('login')}</a></div></section>`);
    });
  });
}

export function renderRecover(root: HTMLElement): void {
  mount(root, html`
    <section class="hero">
      ${hero(true)}
      <div class="sheet">
        <h2>${t('recoverTitle')}</h2>
        <form id="f" novalidate class="stack">
          ${field('email', t('email'), '✉️', 'email', raw('autocomplete="email" inputmode="email" required'))}
          <p class="field-error" id="err" role="alert" hidden></p>
          <button class="btn btn-primary btn-lg" type="submit">${t('recoverSend')}</button>
        </form>
        <div class="auth-links"><a href="#/ingresar">${t('back')}</a></div>
      </div>
    </section>`);
  const form = $('#f', root) as HTMLFormElement;
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const err = $('#err', root);
    const email = inputValue('#email', root).trim();
    if (!validateEmail(email)) { err.hidden = false; err.textContent = t('invalidEmail'); return; }
    void busy(form.querySelector('button'), async () => {
      const { error } = await sb().auth.resetPasswordForEmail(email, { redirectTo: redirectUrl() });
      if (error) { err.hidden = false; err.textContent = friendlyAuthError(error); return; }
      toast(t('recoverSent'), 'ok');
      go('/ingresar');
    });
  });
}

export function renderNewPassword(root: HTMLElement): void {
  mount(root, html`
    <section class="hero">
      ${hero(true)}
      <div class="sheet">
        <h2>${t('newPasswordTitle')}</h2>
        <form id="f" novalidate class="stack">
          ${field('pw', `${t('password')} (mín. 8)`, '🔒', 'password', raw('autocomplete="new-password" required'))}
          ${field('pw2', t('passwordRepeat'), '🔒', 'password', raw('autocomplete="new-password" required'))}
          <p class="field-error" id="err" role="alert" hidden></p>
          <button class="btn btn-primary btn-lg" type="submit">${t('save')}</button>
        </form>
      </div>
    </section>`);
  bindSocial(root);
  const form = $('#f', root) as HTMLFormElement;
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const err = $('#err', root);
    const pw = inputValue('#pw', root);
    if (!validatePassword(pw)) { err.hidden = false; err.textContent = t('weakPassword'); return; }
    if (pw !== inputValue('#pw2', root)) { err.hidden = false; err.textContent = t('passwordsDiffer'); return; }
    void busy(form.querySelector('button[type="submit"]'), async () => {
      const { error } = await sb().auth.updateUser({ password: pw });
      if (error) { err.hidden = false; err.textContent = friendlyAuthError(error); return; }
      toast(t('newPasswordSaved'), 'ok');
      go('/explorar', true);
    });
  });
}

/** Quien entra con Google/Facebook acepta aquí los términos de forma explícita. */
export function renderTerms(root: HTMLElement): void {
  const name = state.profile?.display_name ?? '';
  mount(root, html`
    <section class="hero">
      ${hero(true, name ? `¡Hola, ${name}!` : '¡Bienvenido!')}
      <div class="sheet">
        <h2>Antes de comenzar</h2>
        <p class="small">MtiGo! conecta a personas de tu ciudad para compartir información real de lugares. Para usarla debes:</p>
        <label class="check"><input type="checkbox" id="terms" />
          <span>${t('acceptTermsLabel')} <a href="#/legal/terminos">${t('terms')}</a> ${t('and')} <a href="#/legal/privacidad">${t('privacy')}</a>.</span></label>
        <p class="field-error" id="err" role="alert" hidden></p>
        <button class="btn btn-primary btn-lg" data-action="accept">Aceptar y continuar</button>
        <button class="btn btn-ghost" data-action="out">No acepto, salir</button>
      </div>
    </section>`);
  onAction(root, {
    accept: (btn) => {
      const err = $('#err', root);
      if (!($('#terms', root) as HTMLInputElement).checked) { err.hidden = false; err.textContent = t('mustAcceptTerms'); return; }
      void busy(btn, async () => {
        try { state.profile = await acceptTerms(); go('/explorar', true); } catch (e) { err.hidden = false; err.textContent = friendlyError(e); }
      });
    },
    out: () => void sb().auth.signOut(),
  });
}

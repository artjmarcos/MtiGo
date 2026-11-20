import { sb } from '../supabase';
import { config } from '../config';
import { t } from '../i18n';
import { html, mount, $, onAction, busy, inputValue } from '../lib/dom';
import { go } from '../lib/router';
import { toast } from '../lib/ui';
import { friendlyAuthError } from '../lib/errors';
import { validateEmail, validatePassword } from '../lib/validation';

function logo() {
  return html`<div class="logo" aria-label="MtiGo!"><span class="logo-pin">📍</span><span class="logo-text">MtiGo<b>!</b></span></div>`;
}

function redirectUrl(): string | undefined {
  // Los enlaces del correo abren la versión web pública (funciona desde cualquier teléfono).
  return config.publicWebUrl || undefined;
}

export function renderWelcome(root: HTMLElement): void {
  mount(root, html`
    <section class="welcome">
      ${logo()}
      <p class="tagline">${t('tagline')}</p>
      <ul class="welcome-points">
        <li>🏦 ¿Hay fila en el banco?</li>
        <li>🏪 ¿Está abierta la tienda?</li>
        <li>🏥 ¿Cómo está la sala de urgencias?</li>
      </ul>
      <p class="muted small">Pide información a personas que están en el lugar, o ayuda a otros respondiendo con fotos y texto.</p>
      <div class="stack">
        <a class="btn btn-primary btn-lg" href="#/registro">${t('welcomeSignup')}</a>
        <a class="btn btn-secondary btn-lg" href="#/ingresar">${t('welcomeLogin')}</a>
      </div>
      <p class="muted small center">Piloto en Villarrica, La Araucanía</p>
    </section>`);
}

export function renderLogin(root: HTMLElement): void {
  mount(root, html`
    <section class="auth">
      ${logo()}
      <h1>${t('loginTitle')}</h1>
      <form id="f" novalidate class="stack">
        <label class="label" for="email">${t('email')}</label>
        <input class="input" id="email" type="email" autocomplete="email" inputmode="email" required />
        <label class="label" for="pw">${t('password')}</label>
        <input class="input" id="pw" type="password" autocomplete="current-password" required />
        <p class="field-error" id="err" role="alert" hidden></p>
        <button class="btn btn-primary btn-lg" type="submit">${t('login')}</button>
      </form>
      <div class="stack center">
        <a href="#/recuperar">${t('forgot')}</a>
        <a href="#/registro">${t('noAccount')}</a>
      </div>
    </section>`);
  const form = $('#f', root) as HTMLFormElement;
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const err = $('#err', root);
    const email = inputValue('#email', root).trim();
    const password = inputValue('#pw', root);
    if (!validateEmail(email)) { err.hidden = false; err.textContent = t('invalidEmail'); return; }
    void busy(form.querySelector('button'), async () => {
      const { error } = await sb().auth.signInWithPassword({ email, password });
      if (error) { err.hidden = false; err.textContent = friendlyAuthError(error); return; }
      go('/explorar', true);
    });
  });
}

export function renderSignup(root: HTMLElement): void {
  mount(root, html`
    <section class="auth">
      ${logo()}
      <h1>${t('signupTitle')}</h1>
      <form id="f" novalidate class="stack">
        <label class="label" for="name">${t('displayName')}</label>
        <input class="input" id="name" maxlength="40" autocomplete="nickname" required />
        <label class="label" for="email">${t('email')}</label>
        <input class="input" id="email" type="email" autocomplete="email" inputmode="email" required />
        <label class="label" for="pw">${t('password')} (mín. 8)</label>
        <input class="input" id="pw" type="password" autocomplete="new-password" minlength="8" required />
        <label class="label" for="pw2">${t('passwordRepeat')}</label>
        <input class="input" id="pw2" type="password" autocomplete="new-password" minlength="8" required />
        <label class="check">
          <input type="checkbox" id="terms" />
          <span>${t('acceptTermsLabel')} <a href="#/legal/terminos">${t('terms')}</a> ${t('and')} <a href="#/legal/privacidad">${t('privacy')}</a>.</span>
        </label>
        <p class="field-error" id="err" role="alert" hidden></p>
        <button class="btn btn-primary btn-lg" type="submit">${t('signup')}</button>
      </form>
      <div class="center"><a href="#/ingresar">${t('haveAccount')}</a></div>
    </section>`);
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
    void busy(form.querySelector('button'), async () => {
      const { data, error } = await sb().auth.signUp({
        email, password: pw,
        options: { data: { display_name: name, accepted_terms: 'true' }, emailRedirectTo: redirectUrl() },
      });
      if (error) return show(friendlyAuthError(error));
      if (data.session) { go('/explorar', true); return; }
      mount(root, html`<section class="auth">${logo()}<h1>📧</h1><p>${t('checkEmail')}</p>
        <a class="btn btn-primary btn-lg" href="#/ingresar">${t('login')}</a></section>`);
    });
  });
}

export function renderRecover(root: HTMLElement): void {
  mount(root, html`
    <section class="auth">
      ${logo()}
      <h1>${t('recoverTitle')}</h1>
      <form id="f" novalidate class="stack">
        <label class="label" for="email">${t('email')}</label>
        <input class="input" id="email" type="email" autocomplete="email" inputmode="email" required />
        <p class="field-error" id="err" role="alert" hidden></p>
        <button class="btn btn-primary btn-lg" type="submit">${t('recoverSend')}</button>
      </form>
      <div class="center"><a href="#/ingresar">${t('back')}</a></div>
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
    <section class="auth">
      ${logo()}
      <h1>${t('newPasswordTitle')}</h1>
      <form id="f" novalidate class="stack">
        <label class="label" for="pw">${t('password')} (mín. 8)</label>
        <input class="input" id="pw" type="password" autocomplete="new-password" required />
        <label class="label" for="pw2">${t('passwordRepeat')}</label>
        <input class="input" id="pw2" type="password" autocomplete="new-password" required />
        <p class="field-error" id="err" role="alert" hidden></p>
        <button class="btn btn-primary btn-lg" type="submit">${t('save')}</button>
      </form>
    </section>`);
  const form = $('#f', root) as HTMLFormElement;
  onAction(root, {});
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const err = $('#err', root);
    const pw = inputValue('#pw', root);
    if (!validatePassword(pw)) { err.hidden = false; err.textContent = t('weakPassword'); return; }
    if (pw !== inputValue('#pw2', root)) { err.hidden = false; err.textContent = t('passwordsDiffer'); return; }
    void busy(form.querySelector('button'), async () => {
      const { error } = await sb().auth.updateUser({ password: pw });
      if (error) { err.hidden = false; err.textContent = friendlyAuthError(error); return; }
      toast(t('newPasswordSaved'), 'ok');
      go('/explorar', true);
    });
  });
}

import '@fontsource/poppins/latin-700.css';
import '@fontsource/poppins/latin-800.css';
import './styles.css';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { setLocale, t } from './i18n';
import { isConfigured } from './config';
import { sb } from './supabase';
import { state } from './state';
import { go, parseRoute, type Route } from './lib/router';
import { html, mount } from './lib/dom';
import { toast } from './lib/ui';
import * as api from './lib/api';
import { renderWelcome, renderLogin, renderSignup, renderRecover, renderNewPassword, renderTerms } from './screens/auth';
import { handleCallbackUrl } from './lib/oauth';
import { renderExplore } from './screens/explore';
import { renderCreate } from './screens/create';
import { renderRequest } from './screens/request';
import { renderActivity } from './screens/activity';
import { renderNotifications } from './screens/notifications';
import { renderProfile } from './screens/profile';
import { renderLegal } from './screens/legal';

type Renderer = (root: HTMLElement, params: Record<string, string>) => void | (() => void);

const PUBLIC: Record<string, Renderer> = {
  welcome: renderWelcome, login: renderLogin, signup: renderSignup, recover: renderRecover,
};
const PRIVATE: Record<string, Renderer> = {
  explore: renderExplore, create: renderCreate, request: renderRequest, activity: renderActivity,
  notifications: renderNotifications, profile: renderProfile, newPassword: renderNewPassword, terms: renderTerms,
};
const TABS: [string, string, string, string][] = [
  ['explore', '#/explorar', '🧭', t('navExplore')],
  ['activity', '#/actividad', '📋', t('navActivity')],
  ['create', '#/pedir', '＋', t('navCreate')],
  ['notifications', '#/avisos', '🔔', t('navNotifications')],
  ['profile', '#/perfil', '👤', t('navProfile')],
];

const NAV_ROUTES = ['explore', 'activity', 'notifications', 'profile'];
const navVisible = (name: string) => !!state.session && NAV_ROUTES.includes(name);

let cleanup: (() => void) | void;
let navDepth = 0;
let recovering = false;

const app = document.getElementById('app') as HTMLElement;

function shell(): { screen: HTMLElement; nav: HTMLElement } {
  if (!document.getElementById('screen')) {
    mount(app, html`<div id="offline" class="offline" hidden>📡 ${t('offline')}</div>
      <main id="screen" class="screen"></main><nav id="nav" class="bottom-nav" aria-label="Navegación principal"></nav>`);
  }
  return { screen: document.getElementById('screen') as HTMLElement, nav: document.getElementById('nav') as HTMLElement };
}

function drawNav(nav: HTMLElement, active: string, visible: boolean): void {
  nav.hidden = !visible;
  if (!visible) return;
  mount(nav, html`${TABS.map(([name, href, icon, label]) => html`
    <a href="${href}" class="tab ${name === 'create' ? 'tab-create' : ''} ${name === active ? 'on' : ''}" ${name === active ? html`aria-current="page"` : ''}>
      <span class="tab-icon" aria-hidden="true">${icon}</span><span class="tab-label">${label}</span>
      ${name === 'notifications' && state.unread ? html`<span class="dot" aria-label="${state.unread} sin leer">${state.unread > 9 ? '9+' : state.unread}</span>` : ''}
      ${name === 'activity' && state.activeCount ? html`<span class="dot dot-teal" aria-label="${state.activeCount} activas">${state.activeCount}</span>` : ''}
    </a>`)}`);
}

async function loadProfile(): Promise<void> {
  if (!state.session) { state.profile = null; return; }
  try {
    const { profile, phone } = await api.getMyProfile(state.session.user.id);
    state.profile = profile; state.phone = phone;
  } catch { /* se reintenta al abrir perfil */ }
}

async function refreshBadges(): Promise<void> {
  if (!state.session) return;
  try { state.unread = await api.unreadCount(); } catch { /* sin conexión */ }
  const r = parseRoute(location.hash);
  drawNav(shell().nav, r.name, navVisible(r.name));
}

function render(): void {
  const route: Route = parseRoute(location.hash);
  if (route.name === 'authCallback') return; // supabase-js procesa el enlace y emite el evento
  const { screen, nav } = shell();
  const logged = !!state.session;

  if (recovering && route.name !== 'newPassword') { go('/nueva-clave', true); return; }
  if (route.name === 'notFound') { go(logged ? '/explorar' : '/bienvenida', true); return; }
  if (PRIVATE[route.name] && !logged) { go('/bienvenida', true); return; }
  if (PUBLIC[route.name] && logged) { go('/explorar', true); return; }
  // Cuentas creadas con Google/Facebook: aceptación explícita de términos.
  if (logged && state.profile && !state.profile.accepted_terms_at && route.name !== 'terms' && route.name !== 'legal') { go('/terminos', true); return; }
  if (route.name === 'terms' && state.profile?.accepted_terms_at) { go('/explorar', true); return; }

  if (typeof cleanup === 'function') cleanup();
  cleanup = undefined;
  screen.scrollTop = 0;
  window.scrollTo(0, 0);
  const renderer = route.name === 'legal' ? renderLegal : (PRIVATE[route.name] ?? PUBLIC[route.name]);
  const showNav = navVisible(route.name);
  drawNav(nav, route.name, showNav);
  document.body.classList.toggle('has-nav', showNav);
  try {
    cleanup = renderer(screen, route.params);
  } catch (e) {
    console.error(e);
    mount(screen, html`<div class="empty"><p>⚠️ ${t('genericError')}</p><a class="btn btn-secondary" href="#/explorar">${t('back')}</a></div>`);
  }
}

function notConfigured(): void {
  mount(app, html`<section class="auth"><h1>⚙️ ${t('notConfiguredTitle')}</h1><p>${t('notConfiguredBody')}</p></section>`);
}

async function start(): Promise<void> {
  setLocale('es');
  if (Capacitor.isNativePlatform()) {
    StatusBar.setStyle({ style: Style.Light }).catch(() => undefined);
    StatusBar.setBackgroundColor({ color: '#4CAF50' }).catch(() => undefined);
  }
  if (!isConfigured()) { notConfigured(); await SplashScreen.hide().catch(() => undefined); return; }

  // Enlace de recuperación de contraseña: se detecta antes de que supabase-js
  // procese el enlace, para no perder el evento PASSWORD_RECOVERY.
  if (/type=recovery/.test(location.hash)) recovering = true;
  const client = sb();
  const { data } = await client.auth.getSession();
  state.session = data.session;

  client.auth.onAuthStateChange((event, session) => {
    const wasLogged = !!state.session;
    state.session = session;
    if (event === 'PASSWORD_RECOVERY') { recovering = true; go('/nueva-clave', true); return; }
    if (event === 'USER_UPDATED' && recovering) recovering = false;
    if (event === 'SIGNED_OUT') { state.profile = null; state.unread = 0; state.activeCount = 0; go('/bienvenida', true); return; }
    if (event === 'SIGNED_IN' && !wasLogged) {
      void loadProfile().then(() => { void refreshBadges(); render(); });
    }
  });

  try { [state.categories, state.cities] = await Promise.all([api.getCategories(), api.getCities()]); }
  catch { toast(t('networkError'), 'error'); }
  await loadProfile();

  window.addEventListener('hashchange', () => { navDepth++; render(); });
  document.addEventListener('mtigo:badges', () => {
    const r = parseRoute(location.hash);
    drawNav(shell().nav, r.name, navVisible(r.name));
  });
  // Botón "volver" de pantallas internas.
  document.addEventListener('click', (ev) => {
    const back = (ev.target as HTMLElement).closest('[data-back]');
    if (back && navDepth > 0) { ev.preventDefault(); history.back(); }
  });

  const offline = () => { const el = document.getElementById('offline'); if (el) el.hidden = navigator.onLine; };
  window.addEventListener('online', () => { offline(); void refreshBadges(); });
  window.addEventListener('offline', offline);

  if (Capacitor.isNativePlatform()) {
    App.addListener('backButton', () => {
      const r = parseRoute(location.hash);
      if (['explore', 'welcome'].includes(r.name) || navDepth === 0) void App.exitApp();
      else history.back();
    });
    App.addListener('resume', () => { void refreshBadges(); });
    // Vuelta desde Google/Facebook (io.artjmarcos.mtigo://login-callback).
    App.addListener('appUrlOpen', ({ url }) => {
      void handleCallbackUrl(url).then((err) => { if (err) toast(`No se pudo ingresar: ${err}`, 'error'); });
    });
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void refreshBadges(); });
  window.setInterval(() => { if (document.visibilityState === 'visible') void refreshBadges(); }, 60000);

  if (!location.hash || location.hash === '#' || location.hash === '#/') go(state.session ? '/explorar' : '/bienvenida', true);
  else render();
  offline();
  void refreshBadges();
  await SplashScreen.hide().catch(() => undefined);
}

void start();

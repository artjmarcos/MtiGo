import { html, mount } from '../lib/dom';
import { screenHeader } from '../lib/ui';
import { logoMark } from '../lib/logo';
import { state } from '../state';

/** "Nuestra historia": por qué existe MtiGo! (texto aprobado por la familia). */
export function renderStory(root: HTMLElement): void {
  const back = state.session ? '#/perfil' : '#/bienvenida';
  mount(root, html`${screenHeader('Nuestra historia', back)}
    <div class="content story">
      <div class="story-mark">${logoMark({ size: 96, title: true })}</div>
      <p class="story-lead">MtiGo! nació en Villarrica, en una familia.</p>
      <p>Mati tiene 20 años y una forma muy suya de vivir el mundo. Para ella, la incertidumbre pesa: llegar a un lugar y encontrarlo cerrado, lleno o caótico puede convertir una salida simple en un momento muy difícil. Por eso, junto a su mamá, aprendimos que saber antes de salir lo cambia todo.</p>
      <p>Un día pensamos: ¿y si alguien que ya está ahí pudiera contarnos cómo está?</p>
      <p>Así nació MtiGo!: por <b>Mati</b> y por <b>ir</b>. Una comunidad de personas que prestan sus ojos a otras, para que nadie tenga que salir a ciegas.</p>
      <p>Cada vez que respondes una solicitud, quizás le estás ahorrando un mal momento a alguien que lo necesita más de lo que imaginas.</p>
      <p class="story-end">Gracias por ser parte. 💚</p>
    </div>`);
}

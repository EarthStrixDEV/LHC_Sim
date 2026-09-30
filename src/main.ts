import './styles.css';
import { App } from './app/App';

const root = document.getElementById('app');
if (!root) throw new Error('#app root missing');

new App().start(root).catch((e: unknown) => {
  console.error(e);
  root.innerHTML = `<div class="fatal"><h2>Failed to start the simulator</h2><pre>${String(e instanceof Error ? e.stack ?? e.message : e)}</pre>
  <p>This application needs WebGPU or WebGL 2. Try a current Chrome, Edge, Firefox or Safari.</p></div>`;
});

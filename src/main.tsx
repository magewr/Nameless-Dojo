import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { VfxAudioShowcase } from './components/VfxAudioShowcase';
import './index.css';

const isVfxDemo =
  typeof window !== 'undefined' &&
  (new URLSearchParams(window.location.search).has('vfx-demo') || window.location.hash === '#vfx-demo');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isVfxDemo ? <VfxAudioShowcase /> : <App />}
  </React.StrictMode>
);

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './app.css';
import '../../site/topbar.css';            // the site's bar, shared so it does not move between pages

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

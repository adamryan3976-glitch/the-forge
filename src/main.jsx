/*
 * The Forge · Math Check-In
 * Copyright (c) 2026 Ryan Adams and Natasha Allen. All rights reserved.
 * Not to be copied, modified or distributed without the authors' written permission. See LICENSE.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Fonts are bundled with the app (no request to Google Fonts).
import '@fontsource/cinzel/latin-700.css';
import '@fontsource/cinzel/latin-800.css';
import '@fontsource/lexend/latin-400.css';
import '@fontsource/lexend/latin-500.css';
import '@fontsource/lexend/latin-600.css';
import '@fontsource/lexend/latin-700.css';
import './index.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);

import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
// CSS is loaded via <link> tag in the webview HTML shell (built separately by Tailwind CLI)

const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(<App />);
}

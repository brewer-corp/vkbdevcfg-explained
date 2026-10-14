import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the build works from any sub-path (GitHub Pages serves it under /app/).
// The dev server may read ../site: the top bar's stylesheet lives there, shared with the writeup pages.
export default defineConfig({ base: './', plugins: [react()], server: { fs: { allow: ['..'] } } });

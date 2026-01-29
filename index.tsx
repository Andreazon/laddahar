
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';

console.log("Appen startar...");

const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error("Kunde inte hitta root-elementet!");
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

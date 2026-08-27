import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { HostPage } from './host/HostPage';
import { NodePage } from './node/NodePage';

function App() {
  const match = /^\/r\/([A-Za-z0-9]{4,8})$/.exec(location.pathname);
  if (match) return <NodePage roomCode={match[1].toUpperCase()} />;
  return <HostPage />;
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import './styles.css';
import App from './App';
import { engineError } from './ui/store';

function Unsupported({ message }: { message: string }) {
  return (
    <div className="empty-state">
      <div className="empty-card">
        <h1>Zinklet can’t run here</h1>
        <p>Your browser doesn’t support the graphics features Zinklet needs (WebGL2). Try the latest Chrome, Edge, Safari or Firefox.</p>
        <small className="muted">{message}</small>
      </div>
    </div>
  );
}

const container = document.getElementById('root') as HTMLElement & { __root?: Root };
container.__root ??= createRoot(container);
container.__root.render(<StrictMode>{engineError ? <Unsupported message={engineError} /> : <App />}</StrictMode>);

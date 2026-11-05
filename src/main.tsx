import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { ErrorBoundary } from './components/ErrorBoundary';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary fallbackTitle="ペアカレの表示中にエラーが発生しました">
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

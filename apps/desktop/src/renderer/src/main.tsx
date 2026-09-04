import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App.js';
import { AnnotationSaveWindow } from './AnnotationSaveWindow.js';
import './styles.css';

const isAnnotationSaveWindow =
  new URLSearchParams(window.location.search).get('view') === 'annotation-save';

ReactDOM.createRoot(document.querySelector('#root') as HTMLElement).render(
  <React.StrictMode>
    {isAnnotationSaveWindow ? <AnnotationSaveWindow /> : <App />}
  </React.StrictMode>,
);

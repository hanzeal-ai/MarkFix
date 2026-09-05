import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App.js';
import { AnnotationSaveWindow } from './AnnotationSaveWindow.js';
import { CapturePreviewWindow } from './CapturePreviewWindow.js';
import { HistoryWindow } from './HistoryWindow.js';
import { ProjectHistoryWindow } from './ProjectHistoryWindow.js';
import { SettingsWindow } from './SettingsWindow.js';
import './styles.css';

const view = new URLSearchParams(window.location.search).get('view');

ReactDOM.createRoot(document.querySelector('#root') as HTMLElement).render(
  <React.StrictMode>
    {view === 'annotation-save' ? (
      <AnnotationSaveWindow />
    ) : view === 'capture-preview' ? (
      <CapturePreviewWindow />
    ) : view === 'annotation-history' ? (
      <HistoryWindow />
    ) : view === 'project-annotation-history' ? (
      <ProjectHistoryWindow />
    ) : view === 'settings' ? (
      <SettingsWindow />
    ) : (
      <App />
    )}
  </React.StrictMode>,
);

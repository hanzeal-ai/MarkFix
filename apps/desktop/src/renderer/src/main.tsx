import { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from '@markfix/ui';
import './styles.css';

const App = lazy(() => import('./App.js').then((module) => ({ default: module.App })));
const AnnotationSaveWindow = lazy(() =>
  import('./AnnotationSaveWindow.js').then((module) => ({ default: module.AnnotationSaveWindow })),
);
const CapturePreviewWindow = lazy(() =>
  import('./CapturePreviewWindow.js').then((module) => ({ default: module.CapturePreviewWindow })),
);
const HistoryWindow = lazy(() =>
  import('./HistoryWindow.js').then((module) => ({ default: module.HistoryWindow })),
);
const ProjectHistoryWindow = lazy(() =>
  import('./ProjectHistoryWindow.js').then((module) => ({ default: module.ProjectHistoryWindow })),
);
const SettingsWindow = lazy(() =>
  import('./SettingsWindow.js').then((module) => ({ default: module.SettingsWindow })),
);

const view = new URLSearchParams(window.location.search).get('view');

ReactDOM.createRoot(document.querySelector('#root') as HTMLElement).render(
  <>
    <Suspense fallback={<main className="loading">正在打开 MarkFix…</main>}>
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
    </Suspense>
    <Toaster position="top-center" richColors closeButton />
  </>,
);

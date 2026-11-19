import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ClassSwitchProvider, StoreProvider } from './state/store';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClassSwitchProvider>
      {(classId) => (
        // Une clé par classe : changer de classe remonte l'état de la classe choisie.
        <StoreProvider key={classId} classId={classId}>
          <App />
        </StoreProvider>
      )}
    </ClassSwitchProvider>
  </StrictMode>,
);

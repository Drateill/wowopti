import { useI18n } from '../i18n';

/** Demande à l'app d'afficher un onglet (écouté par App). */
export const openTab = (tab: string) => window.dispatchEvent(new CustomEvent('wowopti:tab', { detail: tab }));

/** Raccourci depuis l'onglet Simulation vers l'onglet Optimisation. */
export function OptimizerPanel() {
  const { t } = useI18n();
  return (
    <div className="optimizer">
      <h4>{t('optTitle')}</h4>
      <p className="small muted">{t('optShortcutHelp')}</p>
      <button className="btn secondary" onClick={() => openTab('optimize')}>
        {t('optOpenTab')}
      </button>
    </div>
  );
}

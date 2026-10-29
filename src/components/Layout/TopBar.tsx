import type { ConnectionState } from '../../store/serialStore';

export type AppView = 'workspace' | 'settings';

export function TopBar(props: {
  view: AppView;
  onViewChange: (v: AppView) => void;
  connectionState: ConnectionState;
}) {
  const { view, onViewChange, connectionState } = props;
  let pill = 'lf-pill';
  let label = 'Offline';
  if (connectionState === 'connected') {
    pill += ' lf-pill--ok';
    label = 'Linked';
  } else if (connectionState === 'connecting') {
    pill += ' lf-pill--busy';
    label = 'Connecting…';
  } else if (connectionState === 'error') {
    pill += ' lf-pill--err';
    label = 'Fault';
  }

  return (
    <header className="lf-header">
      <span className="lf-brand">LaserForge K4</span>
      <nav className="lf-nav" aria-label="Primary">
        <button
          type="button"
          className={view === 'workspace' ? 'lf-nav--active' : ''}
          onClick={() => onViewChange('workspace')}
        >
          Workspace
        </button>
        <button
          type="button"
          className={view === 'settings' ? 'lf-nav--active' : ''}
          onClick={() => onViewChange('settings')}
        >
          Settings
        </button>
      </nav>
      <div className="lf-header__spacer" />
      <span className={pill}>{label}</span>
    </header>
  );
}

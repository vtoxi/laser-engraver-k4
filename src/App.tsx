import { useState } from 'react';
import { SerialEventBootstrap } from './components/SerialEventBootstrap';
import { ConnectionBar } from './components/MachineControl/ConnectionBar';
import { JobControl } from './components/MachineControl/JobControl';
import { StatusBar } from './components/MachineControl/StatusBar';
import { EditorBedWorkspace } from './components/ImageEditor/EditorBedWorkspace';
import { CropPanel } from './components/ImageEditor/CropPanel';
import { FilterPanel } from './components/ImageEditor/FilterPanel';
import { EngravingParams } from './components/Settings/EngravingParams';
import { SettingsScreen } from './components/Settings/SettingsScreen';
import { Sidebar } from './components/Layout/Sidebar';
import { TopBar, type AppView } from './components/Layout/TopBar';
import { useImageStore } from './store/imageStore';
import { useSerialStore } from './store/serialStore';
export default function App() {
  const { openImage, originalPreview } = useImageStore();
  const { connectionState } = useSerialStore();
  const [view, setView] = useState<AppView>('workspace');
  const [activeTab, setActiveTab] = useState<'edit' | 'params'>('edit');

  return (
    <div className="lf-app">
      <SerialEventBootstrap />
      <TopBar view={view} onViewChange={setView} connectionState={connectionState} />

      {view === 'workspace' ? (
        <>
          <ConnectionBar />
          <div className="lf-main">
            <main className="lf-workspace">
              <div className="lf-toolbar">
                <span className="lf-toolbar__title">Job source</span>
                <button type="button" className="lf-btn lf-btn--primary" onClick={() => void openImage()}>
                  Open image
                </button>
              </div>

              {originalPreview && (
                <EditorBedWorkspace />
              )}
            </main>

            <Sidebar>
              <div className="lf-tabs">
                <button
                  type="button"
                  className={activeTab === 'edit' ? 'lf-tabs--on' : ''}
                  onClick={() => setActiveTab('edit')}
                >
                  Image
                </button>
                <button
                  type="button"
                  className={activeTab === 'params' ? 'lf-tabs--on' : ''}
                  onClick={() => setActiveTab('params')}
                >
                  Engrave
                </button>
              </div>

              <div className="lf-inspector__scroll">
                {activeTab === 'edit' && (
                  <>
                    <CropPanel />
                    <FilterPanel />
                  </>
                )}
                {activeTab === 'params' && <EngravingParams />}
              </div>

              <div style={{ borderTop: '1px solid var(--lf-border)' }}>
                <JobControl />
              </div>
              <StatusBar />
            </Sidebar>
          </div>
        </>
      ) : (
        <div className="lf-main">
          <SettingsScreen />
        </div>
      )}
    </div>
  );
}

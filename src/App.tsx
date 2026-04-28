import React, { useState, useEffect } from 'react';
import MindMap, { MindMapData, MindMapTheme } from './components/MindMap';
import { I18nProvider, useTranslation } from './i18n/I18nContext';
import { loadMap, getMapMeta, saveMap } from './lib/api';

function AppContent() {
  const { t } = useTranslation();
  const [data, setData] = useState<MindMapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [mapId, setMapId] = useState<string | null>(null);
  const [requirePassword, setRequirePassword] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const [showSaveModal, setShowSaveModal] = useState(false);
  const [savePassword, setSavePassword] = useState('');
  const [saving, setSaving] = useState(false);

  const [theme, setTheme] = useState<MindMapTheme>({
    l: 0.6,
    c: 0.15,
    h: 250
  });

  useEffect(() => {
    const path = window.location.pathname;
    if (path.startsWith('/a/')) {
      const id = path.split('/a/')[1];
      if (id) {
        setMapId(id);
        getMapMeta(id).then(meta => {
          if (meta.requiresPassword) {
            setRequirePassword(true);
            setLoading(false);
          } else {
            loadData(id);
          }
        }).catch(err => {
          console.error(err);
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  }, []);

  const loadData = async (id: string, password?: string) => {
    try {
      setLoading(true);
      setErrorMsg('');
      const res = await loadMap(id, password);
      setData(res.data);
      setRequirePassword(false);
      setLoading(false);
    } catch (err: any) {
      if (err.message && err.message.toLowerCase().includes("password")) {
        setErrorMsg(t('error.incorrectPassword'));
      } else {
        setErrorMsg(t('error.loadFailed'));
      }
      setLoading(false);
    }
  };

  const handlePublish = async () => {
    if (!data) return;
    setSaving(true);
    try {
      const cleanedData: MindMapData = {
        nodes: data.nodes.filter(n => n.diffStatus !== 'deleted').map(n => {
          const { diffStatus, ...rest } = n;
          return rest;
        }),
        links: data.links
      };

      const res = await saveMap(cleanedData, mapId || undefined, savePassword);
      setShowSaveModal(false);
      setSavePassword('');
      window.location.href = `/a/${res.id}`;
    } catch (err: any) {
      console.error("Save error:", err);
      setErrorMsg(err.message || 'Failed to publish map');
      alert(`Failed to publish map: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-zinc-50">{t('loading')}</div>;
  }

  if (requirePassword) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-sm w-full border border-zinc-200">
          <h2 className="text-xl font-semibold mb-4 text-zinc-800">{t('passwordRequired')}</h2>
          <p className="text-sm text-zinc-500 mb-6">{t('passwordRequiredDesc')}</p>
          <input
            type="password"
            autoFocus
            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition"
            placeholder={t('passwordPlaceholder')}
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadData(mapId!, passwordInput)}
          />
          {errorMsg && <p className="text-red-500 text-sm mt-2">{errorMsg}</p>}
          <button
            onClick={() => loadData(mapId!, passwordInput)}
            className="w-full mt-4 bg-zinc-900 text-white py-2 rounded-lg hover:bg-zinc-800 transition"
          >
            {t('passwordUnlock')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <MindMap
        initialData={data}
        onChange={setData}
        theme={theme}
        onThemeChange={setTheme}
        mapId={mapId}
        onSaveRequested={() => setShowSaveModal(true)}
      />
      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white p-6 rounded-2xl shadow-2xl max-w-sm w-full border border-zinc-200">
            <h2 className="text-xl font-bold mb-2">{t('modal.publishTitle')}</h2>
            <p className="text-sm text-zinc-500 mb-6">
              {t('modal.publishDesc')}
            </p>
            <div className="mb-6">
              <label className="block text-sm font-medium text-zinc-700 mb-1">{t('modal.passwordLabel')}</label>
              <input
                type="password"
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition"
                placeholder={t('modal.passwordPlaceholder')}
                value={savePassword}
                onChange={(e) => setSavePassword(e.target.value)}
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                className="px-4 py-2 text-zinc-600 hover:bg-zinc-100 rounded-lg transition"
                onClick={() => setShowSaveModal(false)}
                disabled={saving}
              >
                {t('modal.cancel')}
              </button>
              <button
                className="px-4 py-2 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition disabled:opacity-50 flex items-center gap-2"
                onClick={handlePublish}
                disabled={saving}
              >
                {saving ? t('modal.publishing') : t('modal.publish')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <AppContent />
    </I18nProvider>
  );
}
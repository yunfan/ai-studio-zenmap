import React, { useState, useEffect } from 'react';
import MindMap, { MindMapData, MindMapTheme } from './components/MindMap';
import { I18nProvider } from './i18n/I18nContext';
import { loadMap, getMapMeta, saveMap } from './lib/api';

const STORAGE_KEY = 'zenmap-data';

function AppContent() {
  const [data, setData] = useState<MindMapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [mapId, setMapId] = useState<string | null>(null);
  const [requirePassword, setRequirePassword] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const [showSaveModal, setShowSaveModal] = useState(false);
  const [savePassword, setSavePassword] = useState('');
  const [saving, setSaving] = useState(false);

  const [theme, setTheme] = useState<MindMapTheme>(() => {
    return {
      l: parseFloat(localStorage.getItem('zenmap-l') || '0.6'),
      c: parseFloat(localStorage.getItem('zenmap-c') || '0.15'),
      h: parseFloat(localStorage.getItem('zenmap-h') || '250')
    };
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
          loadLocal();
        });
      } else {
        loadLocal();
      }
    } else {
      loadLocal();
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
        setErrorMsg("Incorrect password.");
      } else {
        setErrorMsg("Failed to load map.");
      }
      setLoading(false);
    }
  };

  const loadLocal = () => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setData(JSON.parse(saved));
      } catch (e) {}
    }
    setLoading(false);
  };

  useEffect(() => {
    if (data && !mapId) { 
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
  }, [data, mapId]);

  useEffect(() => {
    localStorage.setItem('zenmap-l', theme.l.toString());
    localStorage.setItem('zenmap-c', theme.c.toString());
    localStorage.setItem('zenmap-h', theme.h.toString());
  }, [theme]);

  const handlePublish = async () => {
    if (!data) return;
    setSaving(true);
    try {
      // Clean up diffStatus before saving
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
      // Redirect to new ID
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
    return <div className="min-h-screen flex items-center justify-center bg-zinc-50">Loading...</div>;
  }

  if (requirePassword) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-sm w-full border border-zinc-200">
          <h2 className="text-xl font-semibold mb-4 text-zinc-800">Password Required</h2>
          <p className="text-sm text-zinc-500 mb-6">This map is password protected.</p>
          <input
            type="password"
            autoFocus
            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition"
            placeholder="Enter password..."
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadData(mapId!, passwordInput)}
          />
          {errorMsg && <p className="text-red-500 text-sm mt-2">{errorMsg}</p>}
          <button 
            onClick={() => loadData(mapId!, passwordInput)}
            className="w-full mt-4 bg-zinc-900 text-white py-2 rounded-lg hover:bg-zinc-800 transition"
          >
            Unlock
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
            <h2 className="text-xl font-bold mb-2">Publish Changes</h2>
            <p className="text-sm text-zinc-500 mb-6">
              This will create a new permanent link for your mind map. You can optionally protect it with a password.
            </p>
            <div className="mb-6">
              <label className="block text-sm font-medium text-zinc-700 mb-1">Password (Optional)</label>
              <input
                type="password"
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition"
                placeholder="Leave blank for public access"
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
                Cancel
              </button>
              <button 
                className="px-4 py-2 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition disabled:opacity-50 flex items-center gap-2"
                onClick={handlePublish}
                disabled={saving}
              >
                {saving ? 'Publishing...' : 'Publish'}
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

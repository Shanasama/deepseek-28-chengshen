import React, { useCallback, useEffect, useState } from 'react';
import {
  CharacterScenarioFile,
  GameConfig,
  TrainingDataFile,
} from './types/schema';
import { StoryTreeStudio } from './components/StoryTreeStudio';
import { FullGamePlayView } from './components/FullGamePlayView';

export const App: React.FC = () => {
  const [mode, setMode] = useState<'studio' | 'full_game'>('studio');
  const [config, setConfig] = useState<GameConfig | null>(null);
  const [trainingData, setTrainingData] = useState<TrainingDataFile | null>(
    null
  );
  const [characters, setCharacters] = useState<
    Array<CharacterScenarioFile & { _fileName?: string }>
  >([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastDiskSyncNotice, setLastDiskSyncNotice] = useState<string | null>(
    null
  );

  const loadAllData = useCallback(async (fromWatcher = false) => {
    try {
      const res = await fetch('/api/data');
      const json = await res.json();
      if (!json.ok) {
        throw new Error(json.error || 'Failed to load data');
      }
      setConfig(json.config);
      setTrainingData(json.training);
      setCharacters(json.characters);
      setError(null);
      if (fromWatcher) {
        setLastDiskSyncNotice('⚡ 检测到外部 JSON 修改，已 0 秒热同步');
        setTimeout(() => setLastDiskSyncNotice(null), 3000);
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllData(false);

    // 监听 Vite 插件推送的磁盘 JSON 文件变动事件，实现外部窗口改 JSON 0秒热更新
    if (import.meta.hot) {
      import.meta.hot.on('fish-data-updated', () => {
        loadAllData(true);
      });
    }
  }, [loadAllData]);

  const handleSaveCharacter = async (
    char: CharacterScenarioFile & { _fileName?: string }
  ) => {
    const res = await fetch('/api/save-scenario', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ character: char }),
    });
    const json = await res.json();
    if (!json.ok) {
      alert(`保存失败: ${json.error}`);
      return;
    }
    await loadAllData(false);
  };

  const handleDeleteCharacter = async (fileName: string) => {
    const res = await fetch('/api/delete-scenario', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName }),
    });
    const json = await res.json();
    if (!json.ok) {
      alert(`删除失败: ${json.error}`);
      return;
    }
    await loadAllData(false);
  };

  const handleSaveConfig = async (newConfig: GameConfig) => {
    const res = await fetch('/api/save-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: newConfig }),
    });
    const json = await res.json();
    if (!json.ok) {
      alert(`保存参数失败: ${json.error}`);
      return;
    }
    await loadAllData(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center text-sm">
        正在从本地磁盘 `data/` 载入大肥鱼剧情树与配置数据...
      </div>
    );
  }

  if (error || !config || !trainingData) {
    return (
      <div className="min-h-screen bg-slate-950 text-rose-300 flex flex-col items-center justify-center p-6 gap-3">
        <div className="text-base font-bold">❌ 数据加载错误</div>
        <pre className="bg-slate-900 p-4 rounded-xl border border-rose-500/40 text-xs">
          {error}
        </pre>
        <button
          onClick={() => loadAllData(false)}
          className="px-4 py-2 rounded-xl bg-sky-600 text-white text-xs font-bold"
        >
          重试加载
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* 顶栏：在【内部剧情树编辑与沙盒工作台】与【完整 3 天游戏实机模式】之间秒切 */}
      <header className="h-[52px] px-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">🐟</span>
            <span className="font-bold text-sm tracking-wide text-white">
              大肥鱼游戏 · 内部开发与剧情树工作台
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 font-mono">
              Schema v2 · 磁盘 JSON 双向热同步
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-xl bg-slate-900 p-1 border border-slate-800">
            <button
              onClick={() => setMode('studio')}
              className={`px-3.5 py-1 rounded-lg text-xs font-bold transition ${
                mode === 'studio'
                  ? 'bg-sky-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              🛠️ 剧情树编辑 & 上帝沙盒测试台
            </button>
            <button
              onClick={() => setMode('full_game')}
              className={`px-3.5 py-1 rounded-lg text-xs font-bold transition ${
                mode === 'full_game'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              🖥️ 完整 3 天流程实机模式
            </button>
          </div>
        </div>
      </header>

      {mode === 'studio' ? (
        <StoryTreeStudio
          characters={characters}
          config={config}
          onSaveCharacter={handleSaveCharacter}
          onDeleteCharacter={handleDeleteCharacter}
          onSaveConfig={handleSaveConfig}
          lastDiskSyncNotice={lastDiskSyncNotice}
        />
      ) : (
        <FullGamePlayView
          characters={characters}
          trainingData={trainingData}
          config={config}
        />
      )}
    </div>
  );
};

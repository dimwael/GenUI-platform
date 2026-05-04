import { useState } from 'react';
import { ApiSettings, readSettings, writeSettings } from '../utils/settings';
import './Settings.css';

interface Props {
  darkMode: boolean;
  onClose: () => void;
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  secret?: boolean;
  hint?: React.ReactNode;
}

function Field({ label, value, onChange, placeholder, secret, hint }: FieldProps) {
  const [reveal, setReveal] = useState(false);
  return (
    <label className="settings-field">
      <span className="settings-label">{label}</span>
      <div className="settings-input-row">
        <input
          type={secret && !reveal ? 'password' : 'text'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
        />
        {secret && (
          <button
            type="button"
            className="settings-reveal"
            onClick={() => setReveal(r => !r)}
            title={reveal ? 'Hide' : 'Show'}
            aria-label={reveal ? 'Hide value' : 'Show value'}
          >
            {reveal ? '🙈' : '👁'}
          </button>
        )}
      </div>
      {hint && <div className="settings-hint">{hint}</div>}
    </label>
  );
}

export default function Settings({ darkMode, onClose }: Props) {
  const [settings, setSettings] = useState<ApiSettings>(readSettings);
  const [saved, setSaved] = useState(false);

  const update = <K extends keyof ApiSettings>(key: K, value: ApiSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = () => {
    writeSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClear = () => {
    if (!confirm('Clear all API keys from this browser?')) return;
    const cleared: ApiSettings = {
      tavilyKey: '',
      openaiKey: '',
      anthropicKey: '',
      awsAccessKeyId: '',
      awsSecretAccessKey: '',
      awsSessionToken: '',
      awsRegion: '',
    };
    setSettings(cleared);
    writeSettings(cleared);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className={`settings-backdrop ${darkMode ? 'dark' : ''}`} onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="settings-close" onClick={onClose} aria-label="Close settings">✕</button>
        </div>

        <div className="settings-body">
          <div className="settings-notice">
            Keys are stored locally in your browser and sent to the backend per request. They are never persisted on the server.
          </div>

          <section className="settings-section">
            <h3>🌐 Web Search</h3>
            <Field
              label="Tavily API Key"
              value={settings.tavilyKey}
              onChange={v => update('tavilyKey', v)}
              placeholder="tvly-..."
              secret
              hint={
                <>
                  Get a free key at{' '}
                  <a href="https://app.tavily.com/" target="_blank" rel="noreferrer">app.tavily.com</a>
                  {' '}— 1000 searches/month, no credit card. Without a key, search falls back to Wikipedia.
                </>
              }
            />
          </section>

          <section className="settings-section">
            <h3>🤖 OpenAI</h3>
            <Field
              label="OpenAI API Key"
              value={settings.openaiKey}
              onChange={v => update('openaiKey', v)}
              placeholder="sk-..."
              secret
              hint={
                <>
                  Required to use GPT models. Get a key at{' '}
                  <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">platform.openai.com</a>.
                </>
              }
            />
          </section>

          <section className="settings-section">
            <h3>🧠 Anthropic (Direct)</h3>
            <Field
              label="Anthropic API Key"
              value={settings.anthropicKey}
              onChange={v => update('anthropicKey', v)}
              placeholder="sk-ant-..."
              secret
              hint={
                <>
                  For calling Claude via Anthropic directly (separate from Bedrock). Get a key at{' '}
                  <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">console.anthropic.com</a>.
                </>
              }
            />
          </section>

          <section className="settings-section">
            <h3>☁️ AWS Bedrock</h3>
            <Field
              label="Access Key ID"
              value={settings.awsAccessKeyId}
              onChange={v => update('awsAccessKeyId', v)}
              placeholder="AKIA..."
              secret
            />
            <Field
              label="Secret Access Key"
              value={settings.awsSecretAccessKey}
              onChange={v => update('awsSecretAccessKey', v)}
              placeholder="..."
              secret
            />
            <Field
              label="Session Token (optional, for temporary credentials)"
              value={settings.awsSessionToken}
              onChange={v => update('awsSessionToken', v)}
              placeholder="..."
              secret
            />
            <Field
              label="Region"
              value={settings.awsRegion}
              onChange={v => update('awsRegion', v)}
              placeholder="eu-west-1"
              hint="Leave blank to use the server's default region."
            />
          </section>
        </div>

        <div className="settings-footer">
          <button className="settings-btn secondary" onClick={handleClear}>Clear All</button>
          <div style={{ flex: 1 }} />
          {saved && <span className="settings-saved">✓ Saved</span>}
          <button className="settings-btn primary" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
}

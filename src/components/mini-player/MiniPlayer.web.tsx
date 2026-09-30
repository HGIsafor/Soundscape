import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { MiniPlayerHandle, MiniPlayerProps } from './mini-player-types';
import { miniPlayerStyle } from './mini-player-style';
import { MiniTurntable } from './MiniTurntable';

const preferenceKey = 'soundscape.mini-player.enabled';
const time = (ms: number) => `${Math.floor(ms / 60000)}:${Math.floor(ms % 60000 / 1000).toString().padStart(2, '0')}`;
const readEnabled = () => { try { return localStorage.getItem(preferenceKey) !== 'false'; } catch { return true; } };

export const MiniPlayer = forwardRef<MiniPlayerHandle, MiniPlayerProps>(function MiniPlayer(props, ref) {
  const [enabled, setEnabled] = useState(readEnabled);
  const [settings, setSettings] = useState(false);
  const [notice, setNotice] = useState('');
  const [host, setHost] = useState<HTMLElement | null>(null);
  const popup = useRef<Window | null>(null);
  const dismissed = useRef(false);
  const close = () => {
    dismissed.current = true;
    popup.current?.close();
    popup.current = null;
    setHost(null);
  };
  const changeEnabled = (value: boolean) => {
    setEnabled(value);
    try { localStorage.setItem(preferenceKey, String(value)); setNotice(''); }
    catch { setNotice('This browser cannot save settings. Your choice lasts until you reload.'); }
    if (!value) close();
    else dismissed.current = false;
  };
  const open = () => {
    if (!props.available || !enabled) return;
    if (popup.current && !popup.current.closed) { popup.current.focus(); return; }
    const child = window.open('about:blank', 'soundscape-mini-player', 'popup=yes,resizable=no,width=500,height=600');
    if (!child) { setNotice('Allow popups for Soundscape, then select Mini player again.'); return; }
    dismissed.current = false;
    popup.current = child;
    child.document.title = 'Soundscape · Mini player';
    child.document.documentElement.lang = 'en';
    child.document.documentElement.classList.add('responsive-preview');
    const css = child.document.createElement('style');
    css.textContent = miniPlayerStyle;
    child.document.head.appendChild(css);
    const container = child.document.createElement('main');
    child.document.body.appendChild(container);
    child.addEventListener('pagehide', () => {
      if (popup.current === child) { popup.current = null; dismissed.current = true; setHost(null); }
    }, { once: true });
    setHost(container);
    setNotice('');
  };
  useImperativeHandle(ref, () => ({ leavingPlayback: () => { if (!dismissed.current) open(); } }));
  useEffect(() => {
    const cleanup = () => { popup.current?.close(); popup.current = null; };
    const synchronize = (event: StorageEvent) => {
      if (event.key === preferenceKey) {
        const value = readEnabled(); setEnabled(value);
        if (!value) close();
      }
    };
    window.addEventListener('pagehide', cleanup);
    window.addEventListener('storage', synchronize);
    return () => { cleanup(); window.removeEventListener('pagehide', cleanup); window.removeEventListener('storage', synchronize); };
  }, []);
  useEffect(() => { if (!props.available) close(); }, [props.available]);
  // Native window chrome can close the child without reliably firing pagehide.
  useEffect(() => {
    if (!host) return;
    const timer = window.setInterval(() => { if (!popup.current || popup.current.closed) close(); }, 500);
    return () => window.clearInterval(timer);
  }, [host]);
  if (!props.available) return null;
  const button: CSSProperties = { border: '1px solid #8885', color: 'inherit', background: 'transparent', borderRadius: 20, padding: '9px 13px', cursor: 'pointer', font: '600 11px system-ui' };
  return <div style={{ position: 'relative', color: props.accent }}>
    <div style={{ display: 'flex', gap: 6 }}>
      <button style={{ ...button, opacity: enabled ? 1 : 0.45 }} disabled={!enabled} onClick={open} aria-label="Open mini player">Mini player ↗</button>
      <button style={button} onClick={() => setSettings(value => !value)} aria-label="Mini-player settings" aria-expanded={settings}>⚙</button>
    </div>
    {settings && <div role="group" aria-label="Mini-player settings" style={{ position: 'absolute', top: 42, right: 0, width: 270, background: '#202124', color: '#f4f1e9', border: '1px solid #555', borderRadius: 12, padding: 16, boxShadow: '0 8px 25px #0008', zIndex: 100 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 9, font: '600 13px system-ui' }}><input type="checkbox" checked={enabled} onChange={event => changeEnabled(event.target.checked)} />Enable mini player</label>
      <p style={{ font: '12px/1.5 system-ui', color: '#b8bac1' }}>Opens when you leave Playback. Closing it keeps it closed until you reopen it. This setting is saved on this device.</p>
      <button style={button} onClick={() => setSettings(false)}>Done</button>
    </div>}
    {!!notice && <div role="status" style={{ position: 'absolute', top: 44, right: 0, width: 270, padding: 12, background: '#202124', color: '#eee', font: '12px/1.5 system-ui', zIndex: 101 }}>{notice}<button style={button} onClick={() => setNotice('')}>Dismiss</button></div>}
    {host && createPortal(<Player {...props} onClose={close} onReturn={() => { window.focus(); props.onPlayback(); }} />, host)}
  </div>;
});

function Player(props: MiniPlayerProps & { onClose: () => void; onReturn: () => void }) {
  const playerRoot = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 500, height: 600 });
  useLayoutEffect(() => {
    const owner = playerRoot.current?.ownerDocument.defaultView;
    if (!owner) return;
    const resize = () => setViewport({ width: owner.innerWidth, height: owner.innerHeight });
    resize();
    owner.addEventListener('resize', resize);
    return () => owner.removeEventListener('resize', resize);
  }, []);
  const landscape = viewport.width / viewport.height >= 1.3;
  // Rearrange first, then uniformly shrink only below the usable canvas size.
  const fit = Math.min(1, viewport.width / (landscape ? 480 : 260), viewport.height / (landscape ? 320 : 460));
  const { track } = props;
  const duration = track?.durationMs ?? 0;
  const [progress, setProgress] = useState(track?.progressMs ?? 0);
  const [scrubbing, setScrubbing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [commandError, setCommandError] = useState('');
  const recordRef = useRef<SVGGElement | null>(null);
  const seekValue = useRef(progress);
  const clock = useRef({ position: track?.progressMs ?? 0, at: Date.now() });
  const canControl = props.connected || !!track;
  useEffect(() => {
    clock.current = { position: track?.progressMs ?? 0, at: Date.now() };
    if (!scrubbing) setProgress(clock.current.position);
  }, [track, props.playing]);
  useEffect(() => {
    const applyRotation = (phase: number) => {
      recordRef.current?.setAttribute('transform', `rotate(${phase * 360} 104 95)`);
    };
    applyRotation(props.rotationValue.__getValue());
    const listener = props.rotationValue.addListener(({ value }) => applyRotation(value));
    return () => props.rotationValue.removeListener(listener);
  }, [props.rotationValue]);
  useEffect(() => {
    if (!props.playing || scrubbing) return;
    const tick = () => setProgress(Math.min(duration, clock.current.position + Date.now() - clock.current.at));
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [props.playing, duration, scrubbing]);
  const run = async (command: () => void | Promise<void>) => {
    if (busy) return;
    setBusy(true); setCommandError('');
    try { await command(); } catch { setCommandError('Could not update playback. Please try again.'); }
    finally { setBusy(false); }
  };
  const commit = (value: number) => {
    const next = Math.round(Math.max(0, Math.min(duration, value)));
    setScrubbing(false); setProgress(next);
    clock.current = { position: next, at: Date.now() };
    void run(() => props.onSeek(next));
  };
  return <div ref={playerRoot} className={`responsive-player${landscape ? ' landscape' : ''}`}
    style={{ '--accent': props.accent, '--ink': props.foreground, '--text': props.textColor, '--surface': props.surfaceColor,
      width: viewport.width / fit, height: viewport.height / fit, transform: `scale(${fit})`,
    } as CSSProperties}>
    <header className="top"><div className="brand">SOUNDSCAPE<small>POCKET TURNTABLE / 01</small></div><div className="window-actions"><button aria-label="Close mini player" onClick={props.onClose}>×</button></div></header>
    <MiniTurntable playing={props.playing} artwork={track?.artwork} accent={props.accent} foreground={props.foreground}
      recordRef={element => { recordRef.current = element; }} className="responsive-turntable" />
    <div className="song"><span className="eyebrow">{props.playing ? 'NOW SPINNING' : 'ON THE DECK'}</span><h1 title={track?.title}>{track?.title ?? 'Ready when you are'}</h1><p className="artist" title={track?.artist}>{track?.artist ?? 'Start a song in Spotify'}</p></div>
    <input className="seek" type="range" aria-label="Seek playback" aria-valuetext={`${time(progress)} of ${time(duration)}`} min={0} max={Math.max(1, duration)} step={1000} value={progress} disabled={!duration || busy}
      onPointerDown={() => { seekValue.current = progress; setScrubbing(true); }}
      onChange={event => { seekValue.current = Number(event.target.value); setProgress(seekValue.current); }}
      onPointerUp={() => commit(seekValue.current)} onPointerCancel={() => setScrubbing(false)}
      onKeyUp={event => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) commit(Number(event.currentTarget.value)); }} />
    <div className="times"><span>{time(progress)}</span><span>{time(duration)}</span></div>
    <div className="transport">
      <button aria-label="Previous track" disabled={!canControl || busy} onClick={() => void run(props.onPrevious)}>
        <svg className="skip-symbol" viewBox="0 0 19 19" aria-hidden="true"><path className="skip-stem" d="M0 0h3v19H0z" /><path className="skip-triangle" d="M19 0 6 9.5 19 19z" /></svg>
      </button>
      <button className="play" aria-label={props.playing ? 'Pause' : 'Play'} disabled={!canControl || busy} onClick={() => void run(props.onToggle)}>
        {props.playing
          ? <svg className="pause-symbol" viewBox="0 0 15 20" aria-hidden="true"><path d="M0 0h5v20H0zM10 0h5v20h-5z" /></svg>
          : <svg className="play-symbol" viewBox="0 0 17 22" aria-hidden="true"><path d="M0 0 17 11 0 22z" /></svg>}
      </button>
      <button aria-label="Next track" disabled={!canControl || busy} onClick={() => void run(props.onNext)}>
        <svg className="skip-symbol" viewBox="0 0 19 19" aria-hidden="true"><path className="skip-triangle" d="M0 0 13 9.5 0 19z" /><path className="skip-stem" d="M16 0h3v19h-3z" /></svg>
      </button>
    </div>
    <div className="player-feedback">
    {(props.error || commandError) && <p role="alert" className="notice error" title={props.error || commandError}>{props.error || commandError}</p>}
    {!canControl && <button onClick={() => { props.onReturn(); props.onConnect(); }}>Connect Spotify in Soundscape</button>}
    </div>
    <footer className="footer"><button onClick={props.onReturn}>↗ Open Playback</button><span className="notice">{busy ? 'Updating…' : 'Made for the background.'}</span></footer>
  </div>;
}

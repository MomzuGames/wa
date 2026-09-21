import { events } from './events';

const KEY_EVENTS: Record<string, 'input:back' | 'input:mute' | 'input:hint' | 'input:restart'> = {
  Escape: 'input:back',
  m: 'input:mute',
  h: 'input:hint',
  r: 'input:restart',
};

export function installKeyboard(): () => void {
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const mapped = KEY_EVENTS[key];
    if (mapped) {
      e.preventDefault();
      events.emit(mapped);
    }
    events.emit('input:key', key);
  };
  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}

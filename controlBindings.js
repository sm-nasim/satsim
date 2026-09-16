// Central definition of the simulator's movement controls.
//
// `command` values are the legacy tokens used by thruster configurations and
// the student controller API. `defaultKey` values are the physical keyboard
// keys assigned to those commands for a human pilot.
export const CONTROL_ACTIONS = Object.freeze([
  Object.freeze({ id: 'translatePositiveZ', label: '+Z', group: 'translation', command: 'w', defaultKey: 'w' }),
  Object.freeze({ id: 'translateNegativeZ', label: '-Z', group: 'translation', command: 's', defaultKey: 's' }),
  Object.freeze({ id: 'translatePositiveX', label: '+X', group: 'translation', command: 'a', defaultKey: 'a' }),
  Object.freeze({ id: 'translateNegativeX', label: '-X', group: 'translation', command: 'd', defaultKey: 'd' }),
  Object.freeze({ id: 'translatePositiveY', label: '+Y', group: 'translation', command: 'e', defaultKey: 'e' }),
  Object.freeze({ id: 'translateNegativeY', label: '-Y', group: 'translation', command: 'q', defaultKey: 'q' }),
  Object.freeze({ id: 'pitchPositive', label: '+Pitch', group: 'rotation', command: 'k', defaultKey: 'k' }),
  Object.freeze({ id: 'pitchNegative', label: '-Pitch', group: 'rotation', command: 'i', defaultKey: 'i' }),
  Object.freeze({ id: 'yawPositive', label: '+Yaw', group: 'rotation', command: 'j', defaultKey: 'j' }),
  Object.freeze({ id: 'yawNegative', label: '-Yaw', group: 'rotation', command: 'l', defaultKey: 'l' }),
  Object.freeze({ id: 'rollPositive', label: '+Roll', group: 'rotation', command: 'o', defaultKey: 'o' }),
  Object.freeze({ id: 'rollNegative', label: '-Roll', group: 'rotation', command: 'u', defaultKey: 'u' })
]);

export const CONTROL_COMMANDS = Object.freeze(
  Object.fromEntries(CONTROL_ACTIONS.map(action => [action.id, action.command]))
);

export const CONTROL_COMMAND_KEYS = Object.freeze(
  CONTROL_ACTIONS.map(action => action.command)
);

export const TRANSLATION_COMMAND_KEYS = Object.freeze(
  CONTROL_ACTIONS.filter(action => action.group === 'translation').map(action => action.command)
);

const STORAGE_KEY = 'satsim-control-bindings-v1';

export function normalizePhysicalKey(key) {
  return typeof key === 'string' ? key.toLowerCase() : '';
}

export function formatPhysicalKey(key) {
  if (!key) return 'Unassigned';
  if (key === ' ') return 'Space';
  if (key.length === 1) return key.toUpperCase();

  const labels = {
    arrowup: 'Arrow Up',
    arrowdown: 'Arrow Down',
    arrowleft: 'Arrow Left',
    arrowright: 'Arrow Right',
    capslock: 'Caps Lock',
    pageup: 'Page Up',
    pagedown: 'Page Down'
  };
  return labels[key] || key.charAt(0).toUpperCase() + key.slice(1);
}

export function getDefaultBindings() {
  return Object.fromEntries(CONTROL_ACTIONS.map(action => [action.id, action.defaultKey]));
}

function isValidStoredBindings(candidate) {
  if (!candidate || typeof candidate !== 'object') return false;

  const values = [];
  for (const action of CONTROL_ACTIONS) {
    const key = normalizePhysicalKey(candidate[action.id]);
    if (!key) return false;
    values.push(key);
  }
  return new Set(values).size === values.length;
}

export function loadBindings() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (isValidStoredBindings(stored)) {
      return Object.fromEntries(
        CONTROL_ACTIONS.map(action => [action.id, normalizePhysicalKey(stored[action.id])])
      );
    }
  } catch (error) {
    console.warn('Unable to load saved keyboard controls:', error);
  }
  return getDefaultBindings();
}

export function saveBindings(bindings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings));
    return true;
  } catch (error) {
    console.warn('Unable to save keyboard controls:', error);
    return false;
  }
}

export function clearSavedBindings() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('Unable to clear saved keyboard controls:', error);
  }
}

export function getCommandForPhysicalKey(bindings, physicalKey) {
  const normalizedKey = normalizePhysicalKey(physicalKey);
  const action = CONTROL_ACTIONS.find(item => bindings[item.id] === normalizedKey);
  return action ? action.command : null;
}

export function findActionUsingKey(bindings, physicalKey, excludedActionId = null) {
  const normalizedKey = normalizePhysicalKey(physicalKey);
  return CONTROL_ACTIONS.find(action =>
    action.id !== excludedActionId && bindings[action.id] === normalizedKey
  ) || null;
}

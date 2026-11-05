import { normalizeConfiguration } from '../configLoader.js';

// Version 2 stores editor-space component positions. Runtime systems subtract
// CG exactly once. The STL is source geometry; model pose/scale live in JSON.
export function importEditorConfiguration(input) {
    const data = normalizeConfiguration(JSON.parse(JSON.stringify(input)));
    let legacyEditorModel = input.legacyEditorModel;
    if (input.editorFormatVersion !== 2) {
        // The legacy simulator ignores config.model and uses the uploaded STL
        // as-is. Component positions (including cameras) are all read as p-CG.
        // Match that working pair: display the STL at +CG and leave every
        // component coordinate untouched. This is the same scene translated
        // uniformly by +CG, allowing CG to remain editable in editor space.
        // Replaying old features would rotate/translate an already-baked STL.
        legacyEditorModel = data.model;
        const cg = data.spacecraftProperties.centerOfMass || { x: 0, y: 0, z: 0 };
        data.model = {
            position: { x: cg.x || 0, y: cg.y || 0, z: cg.z || 0 },
            quaternion: { x: 0, y: 0, z: 0, w: 1 },
            scale: { x: 1, y: 1, z: 1 },
            features: []
        };
    }
    return {
        editorFormatVersion: 2,
        legacyEditorModel,
        spacecraftProperties: data.spacecraftProperties,
        model: data.model || { position: { x: 0, y: 0, z: 0 }, quaternion: { x: 0, y: 0, z: 0, w: 1 }, features: [] },
        cameras: { cameras: data.cameras }, cmg: data.cmg,
        lamps: data.lamps, reactionwheels: data.reactionwheels, thrusters: data.thrusters
    };
}

export function exportEditorConfiguration(data) {
    return JSON.parse(JSON.stringify({
        editorFormatVersion: 2,
        legacyEditorModel: data.legacyEditorModel,
        spacecraftProperties: data.spacecraftProperties,
        model: { ...data.model, geometryFrame: 'source' },
        cameras: data.cameras.cameras, cmg: data.cmg,
        lamps: data.lamps.lamps, reactionwheels: data.reactionwheels.wheels,
        thrusters: data.thrusters.thrusters
    }));
}

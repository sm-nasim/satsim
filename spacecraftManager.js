    
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';

// Configuration flag for centering the spacecraft model
// Set to true to center the model (move its center of mass to origin)
// Set to false to use the model as-is (recommended for models exported from editor)
const CENTER_SPACECRAFT_MODEL = false;

// Spacecraft-related variables
let spacecraftGroup = null;
let spacecraftBoundingBoxMesh = null;
let spacecraftBody = null;
let collisionDebug = null;
let collisionDebugVisible = false;

// Green triangles describe the visual box; magenta edges are read from Cannon.
// The latter lives in world space so it independently verifies the body transform.
function installCollisionDebug(model, group, body, scene, box) {
  if (collisionDebug) {
    scene.remove(collisionDebug.physics);
    collisionDebug.physics.geometry.dispose();
    collisionDebug.physics.material.dispose();
  }
  const size = box.getSize(new THREE.Vector3());
  spacecraftBoundingBoxMesh = new THREE.Mesh(
    new THREE.BoxGeometry(size.x, size.y, size.z),
    new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true, depthTest: false,
      transparent: true, opacity: 0.5 })
  );
  spacecraftBoundingBoxMesh.position.copy(box.getCenter(new THREE.Vector3()));
  group.add(spacecraftBoundingBoxMesh);
  const physics = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(2, 2, 2)),
    new THREE.LineBasicMaterial({ color: 0xff00ff, depthTest: false })
  );
  physics.renderOrder = 1000;
  scene.add(physics);
  collisionDebug = { model, group, body, box, physics };
  spacecraftBoundingBoxMesh.visible = physics.visible = collisionDebugVisible;
  updateCollisionDebug();
}

function updateCollisionDebug() {
  if (!collisionDebug) return;
  const { body, physics } = collisionDebug;
  const center = body.pointToWorldFrame(body.shapeOffsets[0]);
  physics.position.copy(center);
  physics.quaternion.copy(body.quaternion.mult(body.shapeOrientations[0]));
  physics.scale.copy(body.shapes[0].halfExtents);
}

function logCollisionDebug() {
  if (!collisionDebug) return;
  const { model, group, body, box } = collisionDebug;
  group.updateWorldMatrix(true, true);
  console.log('Spacecraft collision transforms (bbox in body-local coordinates)', {
    modelScale: model.scale.toArray(), modelPosition: model.position.toArray(),
    modelQuaternion: model.quaternion.toArray(),
    visualBBoxMin: box.min.toArray(), visualBBoxMax: box.max.toArray(),
    visualBBoxCenter: box.getCenter(new THREE.Vector3()).toArray(),
    visualBBoxSize: box.getSize(new THREE.Vector3()).toArray(),
    visualCollisionCenterWorld: spacecraftBoundingBoxMesh.getWorldPosition(new THREE.Vector3()).toArray(),
    physicsBodyPosition: body.position.toArray(), physicsBodyQuaternion: body.quaternion.toArray(),
    physicsShapeHalfExtents: body.shapes[0].halfExtents.toArray(),
    physicsShapeLocalOffset: body.shapeOffsets[0].toArray(),
    physicsCollisionCenterWorld: body.pointToWorldFrame(body.shapeOffsets[0]).toArray(),
    CG: body.centerOfMassOffset?.toArray() || [0, 0, 0]
  });
}

// Fuel system variables - SINGLE SOURCE OF TRUTH
let dryMass = 5;
let fuelMass = 5;
let maxFuelMass = 5;

// Load spacecraft model from a File object
export function loadSpacecraft(file, scene, world, rotation, centroidModel, properties, onLoaded) {
  // Clean up previous spacecraft if it exists
  if (spacecraftGroup) {
    scene.remove(spacecraftGroup);
    world.removeBody(spacecraftBody);
  }

  const fileName = file.name.toLowerCase();
  const isGLB = fileName.endsWith('.glb') || fileName.endsWith('.gltf');
  const url = URL.createObjectURL(file);

  // Create a group to hold the model and its bounding box
  spacecraftGroup = new THREE.Group();
  spacecraftGroup.position.set(10, 0, 0);
  scene.add(spacecraftGroup);

  if (isGLB) {
    const loader = new GLTFLoader();
    loader.load(
      url,
      gltf => {
        const model = gltf.scene;
        processLoadedModel(model, rotation, centroidModel, properties, scene, world, onLoaded);
      },
      undefined,
      err => console.error('GLTF load error:', err)
    );
  } else { // Assume STL
    const loader = new STLLoader();
    loader.load(
      url,
      geometry => {
        const material = new THREE.MeshStandardMaterial({ color: 0x888888 });
        const model = new THREE.Mesh(geometry, material);
        processLoadedModel(model, rotation, centroidModel, properties, scene, world, onLoaded);
      },
      undefined,
      error => {
        console.error('Error loading STL model:', error);
        document.getElementById('hull-status').textContent = 'Error: Invalid STL file';
      }
    );
  }
}

// This function handles the common logic after a model (GLB or STL) is loaded
function processLoadedModel(model, rotation, centroidModel, properties, scene, world, onLoaded) {
  // New editor configs describe the transform of the original/source STL.
  // Legacy configs expect an already-transformed STL and skip this block.
  const transform = properties.sourceModelTransform;
  if (transform) {
    const p = transform.position || { x: 0, y: 0, z: 0 };
    const q = transform.quaternion || { x: 0, y: 0, z: 0, w: 1 };
    const scale = transform.scale || { x: 1, y: 1, z: 1 };
    const cg = properties.centerOfMass || { x: 0, y: 0, z: 0 };
    model.position.set(p.x - (cg.x || 0), p.y - (cg.y || 0), p.z - (cg.z || 0));
    model.quaternion.set(q.x, q.y, q.z, q.w).normalize();
    model.scale.set(scale.x, scale.y, scale.z);
  }

  // 1. Apply successive rotations FIRST
  if (rotation) {
    if (rotation.x !== 0) {
      const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(rotation.x));
      model.quaternion.multiply(qx);
    }
    if (rotation.y !== 0) {
      const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(rotation.y));
      model.quaternion.multiply(qy);
    }
    if (rotation.z !== 0) {
      const qz = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), THREE.MathUtils.degToRad(rotation.z));
      model.quaternion.multiply(qz);
    }
  }

  // Measure before parenting: model.matrixWorld is spacecraft/body-local here.
  // setFromObject includes model position, quaternion, scale and child transforms.
  // STL exported by the editor already has scale and CG translation baked in.
  model.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(model);
  if (CENTER_SPACECRAFT_MODEL) {
    model.position.sub(box.getCenter(new THREE.Vector3()));
    model.updateWorldMatrix(true, true);
    box.setFromObject(model);
  }
  const size = box.getSize(new THREE.Vector3());
  const collisionBoxOffset = box.getCenter(new THREE.Vector3());

  // Add the model to the main group and enable shadows
  spacecraftGroup.add(model);
  
  // Enable shadow casting/receiving on the model mesh
  if (model.isMesh || (model.isGroup && model.children.length > 0)) {
    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }

  // Create physics shape
  const shape = new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2));
  
  // Update fuel system variables if provided in properties
  // Convert strings to numbers
  if (properties.dryMass !== undefined) dryMass = parseFloat(properties.dryMass);
  if (properties.fuelMass !== undefined) fuelMass = parseFloat(properties.fuelMass);
  if (properties.maxFuelMass !== undefined) maxFuelMass = parseFloat(properties.maxFuelMass);
  
  // Calculate total mass (dry mass + fuel mass)
  const totalMass = dryMass + fuelMass;
  
  // Create the body with custom properties if provided
  const bodyOptions = {
    mass: totalMass,
    angularDamping: 0,
    linearDamping: 0,
    allowSleep: false
  };
  
  spacecraftBody = new CANNON.Body(bodyOptions);
  
  // Extract centerOfMass from properties if provided
  const centerOfMassOffset = properties.centerOfMass 
    ? new CANNON.Vec3(
        properties.centerOfMass.x || 0,
        properties.centerOfMass.y || 0,
        properties.centerOfMass.z || 0
      )
    : new CANNON.Vec3(0, 0, 0);
  
  // The group origin tracks body.position. The visual box center is already
  // relative to that origin; CG is metadata, not an additional shape translation.
  spacecraftBody.addShape(shape, new CANNON.Vec3(
    collisionBoxOffset.x, collisionBoxOffset.y, collisionBoxOffset.z
  ));

  // Store centerOfMass for other systems to use
  spacecraftBody.centerOfMassOffset = centerOfMassOffset;
  
  // --- CORRECT INERTIA FIX ---
  // If custom inertia was provided, apply it using the correct Cannon-ES approach
  if (properties.inertia) {
      // DEBUG: Log that we are applying custom inertia
      console.log("DEBUG: Applying custom inertia from properties:", properties.inertia);

      // 1. Define your desired inertia values (Ixx, Iyy, Izz)
      const customInertia = new CANNON.Vec3(
        properties.inertia.x || 0, 
        properties.inertia.y || 0, 
        properties.inertia.z || 0
      );
      
      // 2. Set the inertia and its inverse manually
      spacecraftBody.inertia.copy(customInertia);
      spacecraftBody.invInertia.set(
        customInertia.x > 0 ? 1 / customInertia.x : 0,
        customInertia.y > 0 ? 1 / customInertia.y : 0,
        customInertia.z > 0 ? 1 / customInertia.z : 0
      );
      
      // 3. Apply the changes to the world-space inertia
      spacecraftBody.updateInertiaWorld(true);

      // DEBUG: Log the inertia values on the body after applying them
      console.log("DEBUG: Inertia on spacecraftBody after manual update:", {
          x: spacecraftBody.inertia.x,
          y: spacecraftBody.inertia.y,
          z: spacecraftBody.inertia.z
      });
  } else {
      // DEBUG: Log if no custom inertia was found in properties
      console.log("DEBUG: No custom inertia found in properties. Using default values.");
  }
  // --- END CORRECT INERTIA FIX ---
  
  // Set the body's position to match the group's position
  spacecraftBody.position.copy(spacecraftGroup.position);
  world.addBody(spacecraftBody);

  installCollisionDebug(model, spacecraftGroup, spacecraftBody, scene, box);

  // Add axes helper to the group
  const satAxes = new THREE.AxesHelper(2);
  spacecraftGroup.add(satAxes);

  // Call the callback with the spacecraft body and the main group
  if (onLoaded) onLoaded(spacecraftBody, spacecraftGroup);
  updateCollisionDebug();
  logCollisionDebug();
}

// Toggle visibility of the spacecraft bounding box
export function toggleSpacecraftBoundingBoxVisibility(visible) {
  collisionDebugVisible = visible;
  updateCollisionDebug();
  if (collisionDebug) collisionDebug.physics.visible = visible;
  if (visible) logCollisionDebug();
  if (spacecraftBoundingBoxMesh) {
    spacecraftBoundingBoxMesh.visible = visible;
  }
}

// Get the spacecraft body
export function getSpacecraftBody() {
  return spacecraftBody;
}

// Get the spacecraft mesh (now returns the group)
export function getSpacecraftMesh() {
  return spacecraftGroup;
}

// Update the spacecraft group to match the physics body
export function updateSpacecraft() {
  if (spacecraftGroup && spacecraftBody) {
    spacecraftGroup.position.copy(spacecraftBody.position);
    spacecraftGroup.quaternion.copy(spacecraftBody.quaternion);
  }
  updateCollisionDebug();
}

// Function to update satellite mass based on fuel
export function updateSatelliteMass() {
  if (spacecraftBody) {
    const totalMass = dryMass + fuelMass;
    spacecraftBody.mass = totalMass;
    // Remove this line as it recalculates inertia based on shape
    // spacecraftBody.updateMassProperties();
    
    // Instead, just update the mass-related properties without recalculating inertia
    spacecraftBody.invMass = totalMass > 0 ? 1 / totalMass : 0;
  }
}

// Function to consume fuel
export function consumeFuel(amount) {
  fuelMass = Math.max(0, fuelMass - amount);
  updateSatelliteMass();
  return fuelMass;
}

// Function to get fuel status
export function getFuelStatus() {
  return {
    dryMass,
    fuelMass,
    maxFuelMass,
    fuelPercentage: (fuelMass / maxFuelMass) * 100
  };
}

// Function to reset fuel
export function resetFuel() {
  fuelMass = maxFuelMass;
  updateSatelliteMass();
}

// Function to apply new properties to the spacecraft
export function setFuelProperties(properties) {
  // Update the fuel system variables
  if (properties.dryMass !== undefined) dryMass = properties.dryMass;
  if (properties.fuelMass !== undefined) fuelMass = properties.fuelMass;
  if (properties.maxFuelMass !== undefined) maxFuelMass = properties.maxFuelMass;

  // Update the physics body if it exists
  if (spacecraftBody) {
    const totalMass = dryMass + fuelMass;
    spacecraftBody.mass = totalMass;
    spacecraftBody.invMass = totalMass > 0 ? 1 / totalMass : 0;

    if (properties.inertia) {
      // 1. Define your desired inertia values (Ixx, Iyy, Izz)
      const customInertia = new CANNON.Vec3(
        properties.inertia.x || 0, 
        properties.inertia.y || 0, 
        properties.inertia.z || 0
      );
      
      // 2. Set the inertia and its inverse manually
      spacecraftBody.inertia.copy(customInertia);
      spacecraftBody.invInertia.set(
        customInertia.x > 0 ? 1 / customInertia.x : 0,
        customInertia.y > 0 ? 1 / customInertia.y : 0,
        customInertia.z > 0 ? 1 / customInertia.z : 0
      );
      
      // 3. Apply the changes to the world-space inertia
      spacecraftBody.updateInertiaWorld(true);
    }
    
    // Don't call updateMassProperties() as it will recalculate inertia
    // spacecraftBody.updateMassProperties();
  }
}

// Initialize default spacecraft with fuel system
export function initializeDefaultSpacecraft(scene, world, properties = null) {
  // Use provided properties or default values
  const dryMassValue = properties && properties.dryMass !== undefined ? properties.dryMass : dryMass;
  const fuelMassValue = properties && properties.fuelMass !== undefined ? properties.fuelMass : fuelMass;
  const maxFuelMassValue = properties && properties.maxFuelMass !== undefined ? properties.maxFuelMass : maxFuelMass;
  
  // Update the global variables
  dryMass = dryMassValue;
  fuelMass = fuelMassValue;
  maxFuelMass = maxFuelMassValue;
  
  const totalMass = dryMass + fuelMass;

  const satBody = new CANNON.Body({
    mass: totalMass,
    shape: new CANNON.Box(new CANNON.Vec3(1, 1, 1)),
    angularDamping: 0,
    linearDamping: 0,
    allowSleep: false
  });
  
  satBody.position.set(0, -3, 5.5);
  
  const pitchQuaternion = new CANNON.Quaternion();
  pitchQuaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI/2);
  satBody.quaternion.copy(pitchQuaternion);
  
  // --- CORRECT INERTIA FIX ---
  // If custom inertia was provided, apply it using the correct Cannon-ES approach
  if (properties && properties.inertia) {
    // 1. Define your desired inertia values (Ixx, Iyy, Izz)
    const customInertia = new CANNON.Vec3(
      properties.inertia.x || 0, 
      properties.inertia.y || 0, 
      properties.inertia.z || 0
    );
    
    // 2. Set the inertia and its inverse manually
    satBody.inertia.copy(customInertia);
    satBody.invInertia.set(
      customInertia.x > 0 ? 1 / customInertia.x : 0,
      customInertia.y > 0 ? 1 / customInertia.y : 0,
      customInertia.z > 0 ? 1 / customInertia.z : 0
    );
    
    // 3. Apply the changes to the world-space inertia
    satBody.updateInertiaWorld(true);
  }
  // --- END CORRECT INERTIA FIX ---
  
  world.addBody(satBody);

  const satGeo = new THREE.BoxGeometry(1, 1, 1);
  const satMat = new THREE.MeshStandardMaterial({ color: 0x888888 });
  const satMesh = new THREE.Mesh(satGeo, satMat);
  scene.add(satMesh);

  const satAxes = new THREE.AxesHelper(2);
  satMesh.add(satAxes);

  // Preserve the default physics dimensions (half extents 1) in its debug box.
  installCollisionDebug(satMesh, satMesh, satBody, scene,
    new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1)));
  return { satBody, satMesh };
}
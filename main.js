import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// 1. ENGINE & SCENE SETUP
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa0b0d0);
scene.fog = new THREE.FogExp2(0xa0b0d0, 0.015);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.4));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(50, 100, 50);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(2048, 2048);
scene.add(dirLight);

const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
world.broadphase = new CANNON.SAPBroadphase(world);

const gMat = new CANNON.Material('gMat'), wMat = new CANNON.Material('wMat');
world.addContactMaterial(new CANNON.ContactMaterial(wMat, gMat, { friction: 0.7, restitution: 0.1 }));

// 2. ENVIRONMENT GENERATION
const floorBody = new CANNON.Body({ mass: 0, material: gMat });
floorBody.addShape(new CANNON.Plane());
floorBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
world.addBody(floorBody);

const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
const ctx = canvas.getContext('2d'); ctx.fillStyle = '#222222'; ctx.fillRect(0,0,256,256);
ctx.strokeStyle = '#00ff88'; ctx.lineWidth = 2; ctx.strokeRect(0,0,256,256);
const tex = new THREE.CanvasTexture(canvas); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(100, 100);

const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
floorMesh.rotation.x = -Math.PI / 2; floorMesh.receiveShadow = true;
scene.add(floorMesh);

const obstacles = [];
function addBox(sx, sy, sz, px, py, pz, color=0x777777, rx=0) {
    const b = new CANNON.Body({ mass: 0, material: gMat });
    b.addShape(new CANNON.Box(new CANNON.Vec3(sx/2, sy/2, sz/2)));
    b.position.set(px, py, pz);
    if(rx) b.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), rx);
    world.addBody(b);
    
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), new THREE.MeshStandardMaterial({ color, roughness: 0.5 }));
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    obstacles.push({ body: b, mesh: m });
}
addBox(15, 2, 30, 0, 0.2, -40, 0xff5533, 0.15); // Ramp
addBox(20, 4, 20, -40, 2, -20, 0x3388ff);      // Platform
addBox(4, 4, 4, 15, 2, -15, 0xfacc15);         // Cube

// 3. VEHICLE SETUP
const cBody = new CANNON.Body({ mass: 1200, material: gMat });
cBody.addShape(new CANNON.Box(new CANNON.Vec3(0.9, 0.3, 2.0)));
cBody.position.set(0, 2, 0); cBody.angularDamping = 0.5;

const carGroup = new THREE.Group();
const bMesh = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, 4), new THREE.MeshStandardMaterial({ color: 0x00ff88, roughness: 0.2, metalness: 0.5 }));
bMesh.castShadow = true; carGroup.add(bMesh);
const cMesh = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 1.8), new THREE.MeshStandardMaterial({ color: 0x111111 }));
cMesh.position.set(0, 0.55, -0.2); cMesh.castShadow = true; carGroup.add(cMesh);
scene.add(carGroup);

const vehicle = new CANNON.RaycastVehicle({ chassisBody: cBody, indexUpAxis: 1, indexRightAxis: 0, indexForwardAxis: 2 });
const wOpts = { radius: 0.45, directionLocal: new CANNON.Vec3(0,-1,0), suspensionStiffness: 35, suspensionRestLength: 0.35, maxSuspensionForce: 1e5, maxSuspensionTravel: 0.6, dampingRelaxation: 2.5, dampingCompression: 1.8, frictionSlip: 3.5, rollInfluence: 0.2, axleLocal: new CANNON.Vec3(-1,0,0), chassisConnectionPointLocal: new CANNON.Vec3(0,0,0) };

const wMeshes = [], wGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.4, 24); wGeo.rotateZ(Math.PI/2);
const wMatInst = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.7 });

[ [0.95,-0.1,1.3], [-0.95,-0.1,1.3], [0.95,-0.1,-1.3], [-0.95,-0.1,-1.3] ].forEach((pos) => {
    wOpts.chassisConnectionPointLocal.set(...pos);
    vehicle.addWheel(wOpts);
    const m = new THREE.Mesh(wGeo, wMatInst); m.castShadow = true;
    const ind = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.42), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    m.add(ind); scene.add(m); wMeshes.push(m);
});
vehicle.addToWorld(world);

world.addEventListener('postStep', () => {
    for (let i = 0; i < vehicle.wheelInfos.length; i++) {
        vehicle.updateWheelTransform(i);
        const t = vehicle.wheelInfos[i].worldTransform;
        wMeshes[i].position.copy(t.position); wMeshes[i].quaternion.copy(t.quaternion);
    }
});

// 4. INPUTS & ENGINE LOOP
const keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false, ' ': false };
window.addEventListener('keydown', (e) => { if(e.key.toLowerCase()==='r') reset(); if(e.key in keys) keys[e.key] = true; });
window.addEventListener('keyup', (e) => { if(e.key in keys) keys[e.key] = false; });

function reset() { cBody.position.set(0,3,0); cBody.velocity.set(0,0,0); cBody.angularVelocity.set(0,0,0); cBody.quaternion.set(0,0,0,1); }

const clock = new THREE.Clock(), hud = document.getElementById('speed');
function animate() {
    requestAnimationFrame(animate);
    world.step(1/60, Math.min(clock.getDelta(), 0.1));

    let eng = 0, steer = 0, brk = keys[' '] ? 150 : 0;
    if (keys.ArrowUp) eng = -1800; if (keys.ArrowDown) eng = 1800;
    if (keys.ArrowLeft) steer = 0.45; if (keys.ArrowRight) steer = -0.45;

    vehicle.setSteeringValue(steer, 0); vehicle.setSteeringValue(steer, 1);
    vehicle.setEngineForce(eng, 2); vehicle.setEngineForce(eng, 3);
    for(let i=0; i<4; i++) vehicle.setBrake(brk, i);

    carGroup.position.copy(cBody.position); carGroup.quaternion.copy(cBody.quaternion);
    obstacles.forEach(o => { o.mesh.position.copy(o.body.position); o.mesh.quaternion.copy(o.body.quaternion); });

    const cTarget = new THREE.Vector3(0, 2.2, 7.5).applyQuaternion(carGroup.quaternion).add(cBody.position);
    camera.position.lerp(cTarget, 0.12); camera.lookAt(new THREE.Vector3(cBody.position.x, cBody.position.y + 0.5, cBody.position.z));

    hud.innerText = Math.round(cBody.velocity.length() * 3.6);
    renderer.render(scene, camera);
}
window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });
animate();

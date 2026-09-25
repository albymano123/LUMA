import { useEffect, useRef } from "react";
import * as THREE from "three";

/*
  The landing hero as a small WebGL scene: a route being drawn across a
  stylised city grid, with a safety shell around the destination and a few
  emergency-service markers. It is decoration, so it is built to be cheap:

    - one draw call per kind of object (instanced buildings, merged edges)
    - pixel ratio capped at 1.5, no shadows, no post-processing
    - stops rendering while off screen or when the tab is hidden
    - reports itself slow (onSlow) if it cannot hold ~24 fps, and the page
      then swaps in the 2D version
*/

const BACKGROUND = 0x050c20;
const ROUTE_POINTS = [
  [-11, 6], [-7.5, 5.4], [-5, 2.2], [-1.5, 1.4], [1.5, -1.2], [4.5, -1.8], [7, -4.4], [11, -5],
];
const ALTERNATIVES = [
  [[-11, 6], [-8, 8.2], [-3.5, 6.8], [0.5, 4.6], [4, 2.2], [8.2, -0.6], [11, -5]],
  [[-11, 6], [-9, 3], [-5.5, -0.8], [-1.5, -3.8], [3, -4.6], [8, -6.8], [11, -5]],
];

function curveFrom(points, y = 0.06) {
  return new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, y, z)), false, "catmullrom", 0.5);
}

function glowTexture() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;

  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.25, "rgba(255,255,255,0.45)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  return new THREE.CanvasTexture(canvas);
}

function distanceToPolyline(x, z, samples) {
  let best = Infinity;

  for (const point of samples) {
    const d = Math.hypot(point.x - x, point.z - z);
    if (d < best) best = d;
  }

  return best;
}

// Deterministic pseudo-random so the skyline is the same on every load.
function random(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

export default function HeroScene({ onReady, onSlow }) {
  const mount = useRef(null);
  const callbacks = useRef({ onReady, onSlow });

  useEffect(() => {
    callbacks.current = { onReady, onSlow };
  });

  useEffect(() => {
    const container = mount.current;
    if (!container) return undefined;

    // ---------- renderer ----------
    let renderer;

    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    } catch {
      callbacks.current.onSlow?.();
      return undefined;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = "width:100%;height:100%;display:block";

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(BACKGROUND, 0.034);

    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 160);
    const disposables = [];
    const track = (object) => {
      disposables.push(object);
      return object;
    };

    // ---------- ground grid ----------
    const grid = new THREE.GridHelper(90, 90, 0x2f6bff, 0x16295a);
    grid.material.transparent = true;
    grid.material.opacity = 0.55;
    track(grid.geometry);
    track(grid.material);
    scene.add(grid);

    // ---------- route curves ----------
    const mainCurve = curveFrom(ROUTE_POINTS);
    const routeSamples = mainCurve.getPoints(120);
    const alternativeCurves = ALTERNATIVES.map((points) => curveFrom(points, 0.04));

    // ---------- buildings (instanced) + their edges (one draw call) ----------
    const rand = random(7);
    const blocks = [];

    for (let gx = -22; gx <= 22; gx += 1.7) {
      for (let gz = -14; gz <= 16; gz += 1.7) {
        if (rand() < 0.5) continue;

        const near = distanceToPolyline(gx, gz, routeSamples);
        if (near < 2.1) continue;

        const centre = Math.hypot(gx * 0.7, gz);
        const height = 0.35 + rand() * (4.2 * Math.max(0.15, 1 - centre / 26));
        blocks.push({ x: gx + (rand() - 0.5) * 0.4, z: gz + (rand() - 0.5) * 0.4, w: 0.9 + rand() * 0.5, h: height });
      }
    }

    const boxGeometry = track(new THREE.BoxGeometry(1, 1, 1));
    const buildingMaterial = track(new THREE.MeshBasicMaterial({ color: 0x0c1a3d, transparent: true, opacity: 0.92 }));
    const buildings = new THREE.InstancedMesh(boxGeometry, buildingMaterial, blocks.length);
    const matrix = new THREE.Matrix4();
    const edgePositions = [];

    blocks.forEach((block, index) => {
      matrix.compose(
        new THREE.Vector3(block.x, block.h / 2, block.z),
        new THREE.Quaternion(),
        new THREE.Vector3(block.w, block.h, block.w)
      );
      buildings.setMatrixAt(index, matrix);

      const hx = block.w / 2;
      const y0 = 0;
      const y1 = block.h;
      const corners = [
        [-hx, y0, -hx], [hx, y0, -hx], [hx, y0, hx], [-hx, y0, hx],
        [-hx, y1, -hx], [hx, y1, -hx], [hx, y1, hx], [-hx, y1, hx],
      ].map(([x, y, z]) => [x + block.x, y, z + block.z]);

      [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]].forEach(([a, b]) => {
        edgePositions.push(...corners[a], ...corners[b]);
      });
    });

    scene.add(buildings);

    const edgeGeometry = track(new THREE.BufferGeometry());
    edgeGeometry.setAttribute("position", new THREE.Float32BufferAttribute(edgePositions, 3));
    const edgeMaterial = track(new THREE.LineBasicMaterial({ color: 0x3563d8, transparent: true, opacity: 0.32 }));
    scene.add(new THREE.LineSegments(edgeGeometry, edgeMaterial));

    // ---------- main route (drawn progressively) ----------
    const TUBULAR = 220;
    const RADIAL = 8;
    const tubeGeometry = track(new THREE.TubeGeometry(mainCurve, TUBULAR, 0.13, RADIAL, false));
    const tubeMaterial = track(new THREE.MeshBasicMaterial({ color: 0x38d5f2 }));
    const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
    const tubeIndexCount = tubeGeometry.index.count;
    scene.add(tube);

    const alternativeLines = alternativeCurves.map((curve) => {
      const geometry = track(new THREE.BufferGeometry().setFromPoints(curve.getPoints(160)));
      const material = track(new THREE.LineBasicMaterial({ color: 0x6f86bd, transparent: true, opacity: 0.6 }));
      const line = new THREE.Line(geometry, material);
      scene.add(line);
      return { line, count: 161 };
    });

    // ---------- glow sprites, pins, safety shell, service markers ----------
    const glow = track(glowTexture());
    const sprite = (color, scale, position) => {
      const material = track(new THREE.SpriteMaterial({
        map: glow, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      const item = new THREE.Sprite(material);
      item.scale.set(scale, scale, 1);
      item.position.copy(position);
      scene.add(item);
      return item;
    };

    const start = mainCurve.getPoint(0);
    const end = mainCurve.getPoint(1);
    const sphereGeometry = track(new THREE.SphereGeometry(1, 20, 16));

    const pin = (color, position, radius) => {
      const material = track(new THREE.MeshBasicMaterial({ color }));
      const mesh = new THREE.Mesh(sphereGeometry, material);
      mesh.scale.setScalar(radius);
      mesh.position.copy(position).setY(0.5);
      scene.add(mesh);
      sprite(color, radius * 7, mesh.position);
      return mesh;
    };

    pin(0x34d399, start, 0.38);
    pin(0x5b8dff, end, 0.44);

    const ringGeometry = track(new THREE.RingGeometry(0.72, 0.8, 64));
    const rings = [start, end].map((position, index) => {
      const material = track(new THREE.MeshBasicMaterial({
        color: index ? 0x5b8dff : 0x34d399, transparent: true, side: THREE.DoubleSide, depthWrite: false,
      }));
      const ring = new THREE.Mesh(ringGeometry, material);
      ring.rotation.x = -Math.PI / 2;
      ring.position.copy(position).setY(0.03);
      scene.add(ring);
      return ring;
    });

    // The safety shell around the destination.
    const shellGeometry = track(new THREE.IcosahedronGeometry(2.6, 1));
    const shellMaterial = track(new THREE.MeshBasicMaterial({ color: 0x22d3ee, wireframe: true, transparent: true, opacity: 0.2 }));
    const shell = new THREE.Mesh(shellGeometry, shellMaterial);
    shell.position.copy(end).setY(0.6);
    scene.add(shell);

    // Emergency-service markers near the route: hospital, police, fire.
    const services = [
      { at: mainCurve.getPoint(0.24), color: 0xfb7185, dx: 1.6, dz: 1.5 },
      { at: mainCurve.getPoint(0.52), color: 0x60a5fa, dx: -1.7, dz: -1.4 },
      { at: mainCurve.getPoint(0.78), color: 0xfb923c, dx: 1.4, dz: 1.8 },
    ].map(({ at, color, dx, dz }) => {
      const position = new THREE.Vector3(at.x + dx, 1.5, at.z + dz);
      const stemGeometry = track(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(position.x, 0, position.z), position,
      ]));
      const stemMaterial = track(new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55 }));
      scene.add(new THREE.Line(stemGeometry, stemMaterial));

      const dot = new THREE.Mesh(sphereGeometry, track(new THREE.MeshBasicMaterial({ color })));
      dot.scale.setScalar(0.2);
      dot.position.copy(position);
      scene.add(dot);
      sprite(color, 1.6, position);

      return { dot, base: position.y };
    });

    // The pulse that travels the finished route.
    const pulse = sprite(0xffffff, 1.4, start);

    // ---------- sizing ----------
    const resize = () => {
      const { clientWidth: width, clientHeight: height } = container;
      if (!width || !height) return;

      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    // ---------- pointer parallax ----------
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    const onPointer = (event) => {
      pointer.tx = (event.clientX / window.innerWidth - 0.5) * 2;
      pointer.ty = (event.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("pointermove", onPointer, { passive: true });

    // ---------- animation ----------
    const clock = new THREE.Clock();
    let visible = true;
    let frame = 0;
    let running = true;
    let reported = false;
    let slowFrames = 0;
    let measured = 0;
    let readySent = false;

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    io.observe(container);

    const CYCLE = 9; // seconds: draw, travel, hold, restart

    const render = () => {
      if (!running) return;
      frame = requestAnimationFrame(render);

      if (!visible || document.hidden) {
        clock.getDelta();
        return;
      }

      const dt = Math.min(clock.getDelta(), 0.1);
      const time = clock.elapsedTime;
      const phase = (time % CYCLE) / CYCLE;

      // Draw the route over the first third, then send a pulse along it.
      const drawn = Math.min(1, phase / 0.34);
      const eased = 1 - Math.pow(1 - drawn, 3);
      tubeGeometry.setDrawRange(0, Math.floor((tubeIndexCount * eased) / 3) * 3);
      alternativeLines.forEach(({ line, count }, index) => {
        const own = Math.min(1, Math.max(0, (phase - 0.05 * (index + 1)) / 0.4));
        line.geometry.setDrawRange(0, Math.floor(count * own));
      });

      const travel = Math.min(1, Math.max(0, (phase - 0.34) / 0.4));
      pulse.position.copy(mainCurve.getPoint(travel));
      pulse.position.y = 0.4;
      pulse.material.opacity = phase > 0.34 && phase < 0.8 ? 1 : 0;

      rings.forEach((ring, index) => {
        const t = (time * 0.6 + index * 0.5) % 1;
        ring.scale.setScalar(1 + t * 2.2);
        ring.material.opacity = 0.7 * (1 - t);
      });

      shell.rotation.y += dt * 0.18;
      shell.rotation.x += dt * 0.06;
      shell.material.opacity = 0.14 + 0.08 * Math.sin(time * 1.4);

      services.forEach((service, index) => {
        service.dot.position.y = service.base + Math.sin(time * 1.2 + index * 1.7) * 0.18;
      });

      // Camera: slow drift plus a little parallax from the pointer.
      pointer.x += (pointer.tx - pointer.x) * 0.04;
      pointer.y += (pointer.ty - pointer.y) * 0.04;
      const angle = Math.sin(time * 0.1) * 0.2 + pointer.x * 0.12;
      camera.position.set(Math.sin(angle) * 27, 15.5 - pointer.y * 1.4, Math.cos(angle) * 27 + 1);
      camera.lookAt(0.5, 0.6, 0);

      renderer.render(scene, camera);

      if (!readySent) {
        readySent = true;
        callbacks.current.onReady?.();
      }

      // Hand over to the lightweight version if the device cannot keep up.
      measured += 1;

      if (measured > 30 && !reported) {
        if (dt > 1 / 22) slowFrames += 1;

        if (measured === 150) {
          if (slowFrames > 60) {
            reported = true;
            callbacks.current.onSlow?.();
          } else {
            reported = true;
          }
        }
      }
    };

    frame = requestAnimationFrame(render);

    return () => {
      running = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", onPointer);
      disposables.forEach((item) => item.dispose?.());
      buildings.dispose();
      renderer.dispose();
      renderer.forceContextLoss?.();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={mount} className="hero-scene" aria-hidden="true" />;
}

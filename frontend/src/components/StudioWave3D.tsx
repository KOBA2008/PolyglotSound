import { useEffect, useRef } from "react";
import * as THREE from "three";

/** Ruban sonore 3D du Studio : vert → or → rouge, suit le pointeur avec inertie. */
export default function StudioWave3D({ height = 88, className = "" }: { height?: number; className?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    camera.position.set(0, 0.35, 4.8);
    camera.lookAt(0, 0, 0);

    const N = 100;
    const THICK = 0.028;
    const positions = new Float32Array(N * 2 * 3);
    const colors = new Float32Array(N * 2 * 3);
    const index: number[] = [];
    const green = new THREE.Color("#00d084");
    const gold = new THREE.Color("#ffd700");
    const red = new THREE.Color("#ff1e1e");
    const c = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const x = (t - 0.5) * 5.2;
      if (t < 0.55) c.copy(green).lerp(gold, t / 0.55);
      else c.copy(gold).lerp(red, (t - 0.55) / 0.45);
      for (let k = 0; k < 2; k++) {
        const v = (i * 2 + k) * 3;
        positions[v] = x;
        positions[v + 2] = 0;
        colors[v] = c.r;
        colors[v + 1] = c.g;
        colors[v + 2] = c.b;
      }
      if (i < N - 1) {
        const a = i * 2;
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(index);
    const material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ribbon = new THREE.Mesh(geometry, material);
    const group = new THREE.Group();
    group.add(ribbon);
    scene.add(group);

    const pointer = { x: 0, y: 0 };
    const target = { x: 0, y: 0 };
    const onPointer = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      target.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      target.y = -(((e.clientY - r.top) / r.height) * 2 - 1);
    };

    const resize = () => {
      const w = Math.max(host.clientWidth, 1);
      const h = Math.max(host.clientHeight, 1);
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);

    const clock = new THREE.Clock();
    const pos = geometry.getAttribute("position") as THREE.BufferAttribute;
    let elapsed = 0;
    const render = () => {
      const dt = Math.min(clock.getDelta(), 0.05);
      if (!reduced) elapsed += dt;
      const time = elapsed;
      const ease = reduced ? 1 : 0.07;
      pointer.x += (target.x - pointer.x) * ease;
      pointer.y += (target.y - pointer.y) * ease;
      group.rotation.y = pointer.x * 0.22 + Math.sin(time * 0.32) * 0.04;
      group.rotation.x = -pointer.y * 0.14 + Math.sin(time * 0.48) * 0.02;

      for (let i = 0; i < N; i++) {
        const t = i / (N - 1);
        const envelope = Math.sin(t * Math.PI);
        const wave =
          Math.sin(t * 12.5 + time * 1.9) * 0.16 * envelope * (0.55 + 0.45 * Math.sin(time * 0.8 + t * 5.5)) +
          Math.sin(t * 27 - time * 1.3) * 0.05 * envelope +
          Math.sin(time * 0.7 + t * 3.2) * 0.03;
        pos.setY(i * 2, wave + THICK);
        pos.setY(i * 2 + 1, wave - THICK);
      }
      pos.needsUpdate = true;
      renderer.render(scene, camera);
    };

    host.addEventListener("pointermove", onPointer);
    ro.observe(host);
    resize();
    if (reduced) render();
    else renderer.setAnimationLoop(render);

    const onVisibility = () => {
      if (reduced) return;
      renderer.setAnimationLoop(document.hidden ? null : render);
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      renderer.setAnimationLoop(null);
      ro.disconnect();
      host.removeEventListener("pointermove", onPointer);
      document.removeEventListener("visibilitychange", onVisibility);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [height]);

  return (
    <div
      ref={hostRef}
      className={`neo-inset overflow-hidden rounded-2xl ${className}`}
      style={{ height }}
      aria-hidden="true"
    />
  );
}

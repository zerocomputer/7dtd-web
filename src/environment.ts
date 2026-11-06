import * as THREE from 'three';

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

const DAY_TOP = new THREE.Color(0x2b4a60);
const DAY_HORIZON = new THREE.Color(0x8f9a97);
const DUSK_TOP = new THREE.Color(0x241e35);
const DUSK_HORIZON = new THREE.Color(0xa86545);
const NIGHT_TOP = new THREE.Color(0x03050b);
const NIGHT_HORIZON = new THREE.Color(0x09111f);

export class Environment {
  readonly scene: THREE.Scene;
  readonly sunLight: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly ambient: THREE.AmbientLight;

  hour = 12;
  day = 1;
  dayLength = 720; // seconds for a full 24h cycle
  isNight = false;

  private sky: THREE.Mesh;
  private skyMat: THREE.ShaderMaterial;
  private stars: THREE.Points;
  private starMat: THREE.PointsMaterial;
  private moon: THREE.Mesh;
  private sunDir = new THREE.Vector3(0, 1, 0);
  private moonOffset = new THREE.Vector3(0, 200, 0);
  private lightOffset = new THREE.Vector3(0, 120, 0);
  private tmpColor = new THREE.Color();
  private tmpColor2 = new THREE.Color();
  private underwater = false;
  private renderDistance = 5;
  private nightAmount = 0;
  private timeAccum = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    this.hemi = new THREE.HemisphereLight(0x9fb4c2, 0x3b3328, 0.58);
    this.scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.17);
    this.scene.add(this.ambient);

    this.sunLight = new THREE.DirectionalLight(0xe6d3b3, 1.08);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.left = -52;
    this.sunLight.shadow.camera.right = 52;
    this.sunLight.shadow.camera.top = 52;
    this.sunLight.shadow.camera.bottom = -52;
    this.sunLight.shadow.camera.near = 1;
    this.sunLight.shadow.camera.far = 220;
    this.sunLight.shadow.bias = -0.0004;
    this.sunLight.shadow.normalBias = 0.04;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    const skyGeo = new THREE.SphereGeometry(500, 32, 20);
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        topColor: { value: DAY_TOP.clone() },
        horizonColor: { value: DAY_HORIZON.clone() },
        sunColor: { value: new THREE.Color(0xffd8a0) },
        sunDirection: { value: new THREE.Vector3(0, 1, 0) },
        sunStrength: { value: 1 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 sunColor;
        uniform vec3 sunDirection;
        uniform float sunStrength;
        varying vec3 vWorldPosition;
        void main() {
          vec3 dir = normalize(vWorldPosition - cameraPosition);
          float h = clamp(dir.y, 0.0, 1.0);
          vec3 col = mix(horizonColor, topColor, pow(h, 0.55));
          float sunDot = max(dot(dir, normalize(sunDirection)), 0.0);
          float disc = pow(sunDot, 900.0);
          float glow = pow(sunDot, 12.0) * 0.16 + pow(sunDot, 60.0) * 0.3;
          col += sunColor * (disc * 2.4 + glow) * sunStrength;
          // subtle banding lift near horizon
          col += horizonColor * 0.04 * (1.0 - h);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    this.sky = new THREE.Mesh(skyGeo, this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -100;
    scene.add(this.sky);

    const starCount = 900;
    const positions = new Float32Array(starCount * 3);
    const sizes = new Float32Array(starCount);
    for (let i = 0; i < starCount; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * Math.PI * 2;
      const phi = Math.acos(1 - v * 0.94);
      const r = 420;
      positions[i * 3] = Math.sin(phi) * Math.cos(theta) * r;
      positions[i * 3 + 1] = Math.abs(Math.cos(phi)) * r * 0.9 + 20;
      positions[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * r;
      sizes[i] = 0.5 + Math.random() * 1.5;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    this.starMat = new THREE.PointsMaterial({
      color: 0xdde8ff,
      size: 1.6,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    });
    this.stars = new THREE.Points(starGeo, this.starMat);
    this.stars.frustumCulled = false;
    scene.add(this.stars);

    const moonMat = new THREE.MeshBasicMaterial({ color: 0xdce8ff, fog: false });
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(7.5, 16, 12), moonMat);
    this.moon.frustumCulled = false;
    scene.add(this.moon);

    this.scene.fog = new THREE.Fog(0x8f9a97, 32, 92);
    this.updateLighting(0);
  }

  setUnderwater(v: boolean) {
    this.underwater = v;
  }

  setRenderDistance(chunks: number) {
    this.renderDistance = chunks;
  }

  get fogFar(): number {
    return this.renderDistance * 16 + 12;
  }

  setTime(hour: number, day: number) {
    this.hour = ((hour % 24) + 24) % 24;
    this.day = Math.max(1, day);
  }

  advance(dt: number) {
    this.hour += (dt * 24) / this.dayLength;
    while (this.hour >= 24) {
      this.hour -= 24;
      this.day++;
    }
    this.timeAccum += dt;
    this.updateLighting(dt);
  }

  private updateLighting(dt: number) {
    const theta = ((this.hour - 6) / 12) * Math.PI;
    const elevation = Math.sin(theta);
    this.sunDir.set(Math.cos(theta) * 0.82, Math.sin(theta), 0.42).normalize();
    const dayFactor = smoothstep(-0.08, 0.24, elevation);
    const nightAmount = 1 - smoothstep(-0.16, 0.08, elevation);
    this.nightAmount = nightAmount;
    this.isNight = nightAmount > 0.55;

    const top = this.tmpColor.copy(NIGHT_TOP).lerp(DUSK_TOP, smoothstep(-0.18, 0.03, elevation));
    top.lerp(DAY_TOP, smoothstep(0.06, 0.38, elevation));
    const horizon = this.tmpColor2.copy(NIGHT_HORIZON).lerp(DUSK_HORIZON, smoothstep(-0.16, 0.02, elevation));
    horizon.lerp(DAY_HORIZON, smoothstep(0.08, 0.42, elevation));

    this.skyMat.uniforms.topColor.value.copy(top);
    this.skyMat.uniforms.horizonColor.value.copy(horizon);
    this.skyMat.uniforms.sunDirection.value.copy(this.sunDir);
    const sunStrength = smoothstep(-0.02, 0.12, elevation);
    this.skyMat.uniforms.sunStrength.value = sunStrength;
    const sunColor = this.skyMat.uniforms.sunColor.value as THREE.Color;
    sunColor.setRGB(1, 0.82, 0.55).lerp(new THREE.Color(0xfff2d8), smoothstep(0.05, 0.4, elevation));

    this.starMat.opacity = smoothstep(0.25, 0.9, nightAmount) * 0.95;
    this.stars.rotation.y += dt * 0.004;

    // sun / moon
    this.moonOffset.set(-this.sunDir.x, -this.sunDir.y, -this.sunDir.z).multiplyScalar(380);
    this.moon.position.copy(this.moonOffset);

    const activeDir = elevation > -0.03 ? this.sunDir : this.moonOffset.clone().normalize();
    this.lightOffset.copy(activeDir).multiplyScalar(120);
    this.sunLight.position.copy(this.lightOffset);
    this.sunLight.target.position.set(0, 0, 0);
    if (elevation > -0.03) {
      this.sunLight.color.setRGB(1, 0.83, 0.6).lerp(new THREE.Color(0xfff3dc), smoothstep(0.04, 0.38, elevation));
      this.sunLight.intensity = 0.15 + dayFactor * 1.15;
    } else {
      this.sunLight.color.setRGB(0.52, 0.62, 0.92);
      this.sunLight.intensity = 0.27 * nightAmount;
    }

    this.hemi.color.copy(horizon).lerp(new THREE.Color(0xffffff), 0.25);
    this.hemi.groundColor.setRGB(0.34, 0.29, 0.21);
    this.hemi.intensity = 0.24 + dayFactor * 0.66;
    this.ambient.intensity = 0.14 + dayFactor * 0.23;

    if (this.underwater) {
      const fog = this.scene.fog as THREE.Fog;
      if (fog) {
        fog.color.setHex(0x123c48);
        fog.near = 0.1;
        fog.far = 15;
      }
      this.sunLight.intensity *= 0.45;
      this.hemi.intensity *= 0.7;
      this.ambient.intensity = Math.max(0.12, this.ambient.intensity);
    } else {
      const fog = this.scene.fog as THREE.Fog;
      if (fog) {
        fog.color.copy(horizon);
        fog.near = Math.max(12, this.fogFar * 0.35);
        fog.far = this.fogFar;
      }
      this.scene.background = null;
    }
  }

  /** Keep sky, stars and sun following the player. */
  follow(target: THREE.Vector3) {
    this.sky.position.copy(target);
    this.stars.position.copy(target);
    this.moon.position.copy(target).add(this.moonOffset);
    this.sunLight.position.copy(target).add(this.lightOffset);
    this.sunLight.target.position.copy(target);
    this.sunLight.target.updateMatrixWorld();
  }

  updateFogForUnderwater(_fogColor: number) {
    // Fog and lighting are applied inside updateLighting using setUnderwater().
  }

  get darkness(): number {
    return this.nightAmount;
  }

  timeString(): string {
    const h = Math.floor(this.hour);
    const m = Math.floor((this.hour - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  dispose() {
    this.scene.remove(this.sky, this.stars, this.moon, this.sunLight, this.sunLight.target, this.hemi, this.ambient);
    this.sky.geometry.dispose();
    this.skyMat.dispose();
    (this.moon.material as THREE.Material).dispose();
    this.moon.geometry.dispose();
    this.stars.geometry.dispose();
    this.starMat.dispose();
  }
}

// Holographic globe renderer for the Wayland launcher.
// Geography stays on a unit sphere. A calibrated perspective camera gives the
// near-side land its larger scale while the far-side hologram remains visible.

const GLOBE_RADIUS = 1;
const GLOBE_CENTER_Y = 0.465;
const ROTATION_SPEED = THREE.MathUtils.degToRad(12);
const INITIAL_ROTATION = THREE.MathUtils.degToRad(101);
const FIRST_REVEAL_DELAY = 965;
const REVEAL_DURATION = 550;

let scene;
let camera;
let renderer;
let globeRoot;
let spinGroup;
let anchorPoints = [];
let animId = null;
let revealStartedAt = Infinity;
let globePixelRadius = 160;
let bloomPipeline = null;
let geographyGroup = null;
let hotspots = [];
let rotationAngle = INITIAL_ROTATION;
let lastFrameTime = 0;
let rotationMultiplier = 1;
let launcherActive = true;
let speedBadgeTimer;
let ambientHalo = null;
let atmosphereMesh = null;
let baseGlobePosY = 0;
let isDragging = false;
let dragVelocity = 0;
let pointerNormalizedX = 0;
let pointerNormalizedY = 0;

installLauncherRevealHook();

function installLauncherRevealHook() {
    // app.js is loaded after this file and assigns window.onLauncherShown. Keep its
    // callback intact while adding a globe reveal every time the native window opens.
    let downstreamHandler = null;
    const wrapper = function(...args) {
        if (typeof downstreamHandler === 'function') {
            downstreamHandler.apply(this, args);
        }
        triggerGlobeReveal(false);
    };

    try {
        Object.defineProperty(window, 'onLauncherShown', {
            configurable: true,
            enumerable: true,
            get() {
                return wrapper;
            },
            set(handler) {
                if (handler !== wrapper) downstreamHandler = handler;
            }
        });
    } catch (error) {
        // Older WebKit builds can reject redefining a pre-existing property. The
        // initial reveal still works, and callers can use window.revealGlobe().
        console.warn('[SphereLauncher] Could not install reveal hook:', error);
    }
}

function initGlobe() {
    if (renderer) return;

    const canvas = document.getElementById('globe-canvas');
    if (!canvas || typeof THREE === 'undefined') return;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, 1, 0.1, 3000);
    camera.position.set(0, 0, 1000);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
        premultipliedAlpha: true
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(getRenderPixelRatio());

    globeRoot = new THREE.Group();
    scene.add(globeRoot);

    createAmbientHalo();

    spinGroup = new THREE.Group();
    spinGroup.rotation.x = 0.04;
    spinGroup.rotation.z = -0.025;
    globeRoot.add(spinGroup);

    createBlackCore();
    createSurfaceDust();
    createAtmosphereGlow();
    createHotspots();
    setupAnchorPoints();

    onWindowResize();
    initBloomPipeline();
    loadGeography();

    window.addEventListener('resize', onWindowResize);
    installGlobeControls();
    triggerGlobeReveal(true);

    animate(performance.now());
}

function getRenderPixelRatio() {
    // Four full-screen passes at 2x DPR are unnecessarily expensive in WebKitGTK.
    return Math.min(window.devicePixelRatio || 1, 1.5);
}

function computeGlobeRadius(width, height) {
    // Reference target: a 312 px geometric diameter at 1280x720. Preserve that
    // proportion on the 1920x1080 target monitor instead of capping it early.
    const fluidRadius = Math.min(height * (156 / 720), width * (156 / 1280));
    return THREE.MathUtils.clamp(fluidRadius, 108, 260);
}

function createBlackCore() {
    const geometry = new THREE.SphereGeometry(0.997, 72, 56);
    const material = new THREE.ShaderMaterial({
        vertexShader: `
            varying vec3 vNormal;
            varying vec3 vSurface;
            void main() {
                vNormal = normalize(normalMatrix * normal);
                vSurface = position;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            varying vec3 vNormal;
            varying vec3 vSurface;
            float grain(vec3 p) {
                return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
            }
            void main() {
                float light = max(dot(normalize(vNormal), normalize(vec3(-0.45, 0.7, 0.6))), 0.0);
                float texture = grain(floor(vSurface * 420.0));
                float value = (0.009 + 0.060 * light) * (0.45 + texture);
                gl_FragColor = vec4(vec3(value), 1.0);
            }
        `,
        depthWrite: true,
        depthTest: true
    });
    const core = new THREE.Mesh(geometry, material);
    core.renderOrder = 0;
    spinGroup.add(core);
}

function createAmbientHalo() {
    const texture = createHaloTexture();
    const material = new THREE.SpriteMaterial({
        map: texture,
        color: 0xffffff,
        transparent: true,
        opacity: 0.05,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false
    });
    const halo = new THREE.Sprite(material);
    halo.scale.set(2.32, 2.32, 1);
    halo.position.z = -1.25;
    halo.renderOrder = -10;
    ambientHalo = halo;
    globeRoot.add(halo);
}

function createHaloTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(128, 128, 72, 128, 128, 128);
    gradient.addColorStop(0, 'rgba(255,255,255,0)');
    gradient.addColorStop(0.52, 'rgba(255,255,255,0)');
    gradient.addColorStop(0.64, 'rgba(255,255,255,0.018)');
    gradient.addColorStop(0.72, 'rgba(255,255,255,0.09)');
    gradient.addColorStop(0.82, 'rgba(255,255,255,0.20)');
    gradient.addColorStop(0.92, 'rgba(255,255,255,0.06)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(canvas);
}

function createAtmosphereGlow() {
    const vertexShader = `
        varying vec3 vWorldNormal;
        varying vec3 vWorldPosition;
        void main() {
            vWorldNormal = normalize(mat3(modelMatrix) * normal);
            vec4 worldPosition = modelMatrix * vec4(position, 1.0);
            vWorldPosition = worldPosition.xyz;
            gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
    `;

    const fragmentShader = `
        varying vec3 vWorldNormal;
        varying vec3 vWorldPosition;
        void main() {
            vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
            float facing = max(dot(normalize(vWorldNormal), viewDirection), 0.0);
            float rim = pow(1.0 - facing, 4.1);
            vec3 hotDirection = normalize(vec3(-0.48, 0.62, 0.62));
            float upperLeft = pow(max(dot(normalize(vWorldNormal), hotDirection), 0.0), 5.0);
            float alpha = rim * 0.035 + rim * upperLeft * 0.22;
            gl_FragColor = vec4(vec3(1.0), alpha);
        }
    `;

    const geometry = new THREE.SphereGeometry(1.038, 72, 56);
    const material = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: true,
        blending: THREE.AdditiveBlending,
        side: THREE.FrontSide,
        depthWrite: false,
        depthTest: true
    });
    const atmosphere = new THREE.Mesh(geometry, material);
    atmosphere.renderOrder = 8;
    atmosphereMesh = atmosphere;
    globeRoot.add(atmosphere);
}

function createHotspots() {
    const texture = createGlowTexture(128);
    const definitions = [
        { lat: 51, lon: 12, size: 0.40, opacity: 0.64 },
        { lat: 32, lon: 117, size: 0.50, opacity: 0.64 },
        { lat: 36, lon: 138, size: 0.18, opacity: 0.32 },
        { lat: 40, lon: -77, size: 0.30, opacity: 0.50 }
    ];

    definitions.forEach(spec => {
        const material = new THREE.SpriteMaterial({
            map: texture,
            color: 0xffffff,
            transparent: true,
            opacity: spec.opacity,
            blending: THREE.AdditiveBlending,
            depthTest: false,
            depthWrite: false
        });
        const sprite = new THREE.Sprite(material);
        sprite.position.copy(latLonToUnit(spec.lat, spec.lon, 1.018));
        sprite.scale.set(spec.size, spec.size, 1);
        sprite.renderOrder = 7;
        sprite.userData.opacity = spec.opacity;
        spinGroup.add(sprite);
        hotspots.push(sprite);
    });
}

function updateHotspots() {
    scene.updateMatrixWorld(true);
    const center = globeRoot.getWorldPosition(new THREE.Vector3());
    hotspots.forEach(sprite => {
        const position = sprite.getWorldPosition(new THREE.Vector3());
        const facing = position.clone().sub(center).normalize()
            .dot(camera.position.clone().sub(position).normalize());
        sprite.material.opacity = sprite.userData.opacity * THREE.MathUtils.smoothstep(facing, 0.02, 0.38);
    });
}

function installGlobeControls() {
    const hitArea = document.getElementById('globe-interaction');
    if (!hitArea) return;
    let previousX = 0;
    let lastTime = 0;

    hitArea.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        isDragging = true;
        dragVelocity = 0;
        previousX = event.clientX;
        lastTime = performance.now();
        hitArea.setPointerCapture(event.pointerId);
        hitArea.classList.add('dragging');
    });

    hitArea.addEventListener('pointermove', event => {
        const now = performance.now();
        const rect = hitArea.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
            pointerNormalizedX = THREE.MathUtils.clamp((event.clientX - (rect.left + rect.width * 0.5)) / (rect.width * 0.5), -1, 1);
            pointerNormalizedY = THREE.MathUtils.clamp((event.clientY - (rect.top + rect.height * 0.5)) / (rect.height * 0.5), -1, 1);
        }

        if (isDragging) {
            const deltaX = event.clientX - previousX;
            rotationAngle += deltaX / globePixelRadius;
            const dt = Math.max(now - lastTime, 10);
            dragVelocity = (deltaX / globePixelRadius) * (16 / dt);
            previousX = event.clientX;
            lastTime = now;
        }
    });

    const release = () => {
        isDragging = false;
        hitArea.classList.remove('dragging');
    };

    hitArea.addEventListener('pointerup', release);
    hitArea.addEventListener('lostpointercapture', release);
    hitArea.addEventListener('pointerleave', () => {
        if (!isDragging) {
            pointerNormalizedX = 0;
            pointerNormalizedY = 0;
        }
    });

    hitArea.addEventListener('wheel', event => {
        event.preventDefault();
        rotationMultiplier = THREE.MathUtils.clamp(rotationMultiplier + (event.deltaY < 0 ? 0.5 : -0.5), 0.5, 2.5);
        const badge = document.getElementById('globe-speed');
        badge.textContent = `▶ ${rotationMultiplier.toFixed(1)}x`;
        badge.classList.add('visible');
        clearTimeout(speedBadgeTimer);
        speedBadgeTimer = setTimeout(() => badge.classList.remove('visible'), 1400);
    }, { passive: false });
}

function createSurfaceDust() {
    const positions = [];
    const count = 8000;
    let seed = 0x6d2b79f5;
    const random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
    };

    for (let index = 0; index < count; index += 1) {
        const y = random() * 2 - 1;
        const ringRadius = Math.sqrt(Math.max(0, 1 - y * y));
        const theta = random() * Math.PI * 2;
        positions.push(
            Math.cos(theta) * ringRadius * 1.002,
            y * 1.002,
            Math.sin(theta) * ringRadius * 1.002
        );
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.72,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0.13,
        blending: THREE.AdditiveBlending,
        depthTest: true,
        depthWrite: false
    });
    material.userData.basePointSize = 0.72;
    const dust = new THREE.Points(geometry, material);
    dust.renderOrder = 1;
    spinGroup.add(dust);
}

function createGlowTexture(size = 64) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const center = size / 2;
    const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.1, 'rgba(255,255,255,0.9)');
    gradient.addColorStop(0.34, 'rgba(255,255,255,0.34)');
    gradient.addColorStop(0.68, 'rgba(255,255,255,0.07)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
}

function loadGeography() {
    fetch('countries-110m.json')
        .then(response => {
            // WebKitGTK reports successful file:// fetches with status 0.
            if (!response.ok && response.status !== 0) throw new Error(`HTTP ${response.status}`);
            return response.json();
        })
        .then(renderCountryTopology)
        .catch(error => {
            console.warn('[SphereLauncher] Country topology unavailable; using coastline fallback.', error);
            return fetch('land.json')
                .then(response => response.json())
                .then(renderGeoJsonFallback)
                .catch(fallbackError => {
                    console.warn('[SphereLauncher] Geography fallback failed.', fallbackError);
                    generateSyntheticLandMesh();
                });
        });
}

function renderCountryTopology(topology) {
    if (!topology || topology.type !== 'Topology' || !Array.isArray(topology.arcs)) {
        throw new Error('Invalid country TopoJSON');
    }

    geographyGroup = new THREE.Group();
    spinGroup.add(geographyGroup);

    const decodedArcs = decodeTopologyArcs(topology);
    const countries = topology.objects && topology.objects.countries;
    const geometries = countries && countries.geometries ? countries.geometries : [];
    const arcUseCount = new Uint16Array(decodedArcs.length);

    geometries.forEach(geometry => countArcReferences(geometry.arcs, arcUseCount));

    const coastlinePositions = [];
    const borderPositions = [];
    decodedArcs.forEach((arc, index) => {
        const destination = arcUseCount[index] > 1 ? borderPositions : coastlinePositions;
        appendArcToSphere(destination, arc, arcUseCount[index] > 1 ? 1.008 : 1.012);
    });

    addLineLayer(coastlinePositions, 0.88, 3);
    addLineLayer(borderPositions, 0.62, 3);

    const landPolygons = [];
    geometries.forEach(geometry => {
        topologyGeometryPolygons(geometry).forEach(polygonArcRings => {
            const rings = polygonArcRings
                .map(arcIndexes => stitchTopologyRing(arcIndexes, decodedArcs))
                .filter(ring => ring.length >= 4);
            const polygon = prepareLandPolygon(rings);
            if (polygon) landPolygons.push(polygon);
        });
    });
    createLandLattice(landPolygons);
}

function decodeTopologyArcs(topology) {
    const transform = topology.transform || { scale: [1, 1], translate: [0, 0] };
    const scale = transform.scale || [1, 1];
    const translate = transform.translate || [0, 0];

    return topology.arcs.map(encodedArc => {
        let x = 0;
        let y = 0;
        return encodedArc.map(point => {
            x += point[0];
            y += point[1];
            return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
        });
    });
}

function countArcReferences(value, counts) {
    if (!Array.isArray(value)) return;
    if (value.length > 0 && typeof value[0] === 'number') {
        value.forEach(index => {
            const resolved = index < 0 ? ~index : index;
            if (resolved >= 0 && resolved < counts.length) counts[resolved] += 1;
        });
        return;
    }
    value.forEach(child => countArcReferences(child, counts));
}

function topologyGeometryPolygons(geometry) {
    if (!geometry || !geometry.arcs) return [];
    if (geometry.type === 'Polygon') return [geometry.arcs];
    if (geometry.type === 'MultiPolygon') return geometry.arcs;
    return [];
}

function stitchTopologyRing(arcIndexes, decodedArcs) {
    const ring = [];
    arcIndexes.forEach((signedIndex, arcPosition) => {
        const index = signedIndex < 0 ? ~signedIndex : signedIndex;
        const source = decodedArcs[index] || [];
        const arc = signedIndex < 0 ? source.slice().reverse() : source;
        arc.forEach((point, pointIndex) => {
            if (arcPosition > 0 && pointIndex === 0) return;
            ring.push(point);
        });
    });
    return ring;
}

function appendArcToSphere(destination, arc, radius) {
    for (let index = 1; index < arc.length; index += 1) {
        appendGreatCircleSegment(destination, arc[index - 1], arc[index], radius, 2.2);
    }
}

function appendGreatCircleSegment(destination, startLonLat, endLonLat, radius, maxDegrees) {
    const start = latLonToUnit(startLonLat[1], startLonLat[0], radius);
    const end = latLonToUnit(endLonLat[1], endLonLat[0], radius);
    const startUnit = start.clone().normalize();
    const endUnit = end.clone().normalize();
    const dot = THREE.MathUtils.clamp(startUnit.dot(endUnit), -1, 1);
    const angle = Math.acos(dot);
    const steps = Math.max(1, Math.ceil(THREE.MathUtils.radToDeg(angle) / maxDegrees));
    let previous = start;

    for (let step = 1; step <= steps; step += 1) {
        const current = slerpUnitVectors(startUnit, endUnit, step / steps).multiplyScalar(radius);
        destination.push(previous.x, previous.y, previous.z, current.x, current.y, current.z);
        previous = current;
    }
}

function slerpUnitVectors(start, end, amount) {
    const dot = THREE.MathUtils.clamp(start.dot(end), -1, 1);
    const angle = Math.acos(dot);
    if (angle < 1e-5) return start.clone().lerp(end, amount).normalize();
    const denominator = Math.sin(angle);
    const a = Math.sin((1 - amount) * angle) / denominator;
    const b = Math.sin(amount * angle) / denominator;
    return start.clone().multiplyScalar(a).add(end.clone().multiplyScalar(b)).normalize();
}

function prepareLandPolygon(rings) {
    if (!rings.length) return null;
    const contour = unwrapRing(rings[0]);
    if (contour.length < 3) return null;
    const meanLatitude = contour.reduce((sum, point) => sum + point.y, 0) / contour.length;
    // Keep Antarctica's outline, but exclude the pole from planar land tests.
    if (meanLatitude < -72) return null;
    const contourMeanLongitude = contour.reduce((sum, point) => sum + point.x, 0) / contour.length;
    const holes = rings.slice(1).map(ring => {
        const hole = unwrapRing(ring);
        if (!hole.length) return hole;
        const holeMean = hole.reduce((sum, point) => sum + point.x, 0) / hole.length;
        const shift = Math.round((contourMeanLongitude - holeMean) / 360) * 360;
        hole.forEach(point => { point.x += shift; });
        return hole;
    }).filter(hole => hole.length >= 3);

    return {
        contour, holes, longitude: contourMeanLongitude,
        minLon: Math.min(...contour.map(p => p.x)),
        maxLon: Math.max(...contour.map(p => p.x)),
        minLat: Math.min(...contour.map(p => p.y)),
        maxLat: Math.max(...contour.map(p => p.y))
    };
}

function pointInRing(lon, lat, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i];
        const b = ring[j];
        if ((a.y > lat) !== (b.y > lat) &&
            lon < (b.x - a.x) * (lat - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
}

function isLand(lon, lat, polygons) {
    return polygons.some(polygon => {
        if (lat < polygon.minLat || lat > polygon.maxLat) return false;
        const x = lon + Math.round((polygon.longitude - lon) / 360) * 360;
        return x >= polygon.minLon && x <= polygon.maxLon &&
            pointInRing(x, lat, polygon.contour) &&
            !polygon.holes.some(hole => pointInRing(x, lat, hole));
    });
}

function unitToLonLat(point) {
    return {
        lon: THREE.MathUtils.radToDeg(Math.atan2(-point.z, point.x)),
        lat: THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(point.y, -1, 1)))
    };
}

function createLandLattice(polygons) {
    // Three r128 subdivides each icosahedron face into (detail + 1)^2 cells.
    // A land mask on this uniform sphere avoids coastal triangle fans entirely.
    const lattice = new THREE.IcosahedronGeometry(1, 12);
    const positions = lattice.getAttribute('position');
    const vertices = new Map();
    const edges = new Set();
    const mesh = [];
    const oceanMesh = [];
    const particles = [];
    const brightParticles = [];
    const vertex = index => {
        const point = new THREE.Vector3().fromBufferAttribute(positions, index);
        const key = `${point.x.toFixed(5)},${point.y.toFixed(5)},${point.z.toFixed(5)}`;
        if (vertices.has(key)) return vertices.get(key);
        const geographic = unitToLonLat(point.clone().normalize());
        const hash = stableTriangleHash(geographic, 0);
        point.x += ((hash & 255) / 255 - 0.5) * 0.045;
        point.y += (((hash >>> 8) & 255) / 255 - 0.5) * 0.045;
        point.z += (((hash >>> 16) & 255) / 255 - 0.5) * 0.045;
        point.normalize();
        const coords = unitToLonLat(point);
        const result = { key, point, land: isLand(coords.lon, coords.lat, polygons) };
        vertices.set(key, result);
        return result;
    };
    for (let i = 0; i < positions.count; i += 3) {
        const cells = [vertex(i), vertex(i + 1), vertex(i + 2)];
        const center = cells[0].point.clone().add(cells[1].point).add(cells[2].point).normalize();
        const coords = unitToLonLat(center);
        const land = isLand(coords.lon, coords.lat, polygons) && cells.filter(v => v.land).length >= 2;
        const hash = stableTriangleHash(coords, i);
        for (let edge = 0; edge < 3; edge++) {
            const a = cells[edge];
            const b = cells[(edge + 1) % 3];
            const key = [a.key, b.key].sort().join('|');
            // Separate sets for faint ocean and land so a coastal cell can be promoted.
            const layerKey = `${land ? 'land' : 'ocean'}:${key}`;
            if (edges.has(layerKey)) continue;
            edges.add(layerKey);
            if (!land && hash % 4 !== 0) continue;
            const dest = land ? mesh : oceanMesh;
            const aLL = unitToLonLat(a.point);
            const bLL = unitToLonLat(b.point);
            appendGreatCircleSegment(dest, [aLL.lon, aLL.lat], [bLL.lon, bLL.lat], 1.005, 1.2);
        }
        if (land) {
            const point = center.multiplyScalar(1.012);
            particles.push(point.x, point.y, point.z);
            if (hash % 29 === 0) brightParticles.push(point.x, point.y, point.z);
        }
    }
    lattice.dispose();
    addLineLayer(oceanMesh, 0.032, 1);
    addLineLayer(mesh, 0.25, 2);
    addParticleLayers(particles, brightParticles);
}

function unwrapRing(ring) {
    const points = ring.slice();
    if (points.length > 1) {
        const first = points[0];
        const last = points[points.length - 1];
        if (Math.abs(first[0] - last[0]) < 1e-7 && Math.abs(first[1] - last[1]) < 1e-7) {
            points.pop();
        }
    }
    if (!points.length) return [];

    const result = [];
    let previousLongitude = points[0][0];
    points.forEach((point, index) => {
        let longitude = point[0];
        if (index > 0) {
            while (longitude - previousLongitude > 180) longitude -= 360;
            while (longitude - previousLongitude < -180) longitude += 360;
        }
        previousLongitude = longitude;
        const previous = result[result.length - 1];
        if (!previous || Math.abs(previous.x - longitude) > 1e-7 || Math.abs(previous.y - point[1]) > 1e-7) {
            result.push(new THREE.Vector2(longitude, point[1]));
        }
    });
    return result;
}

function stableTriangleHash(point, index) {
    const lon = Math.round((point.lon + 540) * 100);
    const lat = Math.round((point.lat + 90) * 100);
    let value = (lon * 73856093) ^ (lat * 19349663) ^ (index * 83492791);
    value ^= value >>> 16;
    return Math.abs(value);
}

function addLineLayer(positions, opacity, renderOrder) {
    if (!positions.length || !geographyGroup) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeBoundingSphere();
    const material = new THREE.ShaderMaterial({
        uniforms: {
            opacity: { value: opacity },
            backOpacity: { value: renderOrder === 3 ? 0.85 : 0.10 }
        },
        vertexShader: `
            varying vec3 vNormal;
            void main() {
                vNormal = normalize(mat3(modelMatrix) * normalize(position));
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform float opacity;
            uniform float backOpacity;
            varying vec3 vNormal;
            void main() {
                vec3 n = normalize(vNormal);
                float front = smoothstep(-0.06, 0.12, n.z);
                vec3 illuminatedNormal = vec3(n.xy, abs(n.z));
                float key = max(dot(illuminatedNormal, normalize(vec3(-0.45, 0.7, 0.6))), 0.0);
                float light = 0.72 + 0.48 * key * key;
                float alpha = opacity * mix(backOpacity, 1.0, front) * light;
                gl_FragColor = vec4(vec3(1.0), alpha);
            }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false
    });
    const lines = new THREE.LineSegments(geometry, material);
    lines.renderOrder = renderOrder;
    geographyGroup.add(lines);
}

function addParticleLayers(particlePositions, brightParticlePositions) {
    if (!geographyGroup) return;
    const texture = createGlowTexture(64);

    if (particlePositions.length) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(particlePositions, 3));
        const material = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 1.7 * globePixelRadius / 124.8,
            sizeAttenuation: false,
            map: texture,
            transparent: true,
            opacity: 0.66,
            alphaTest: 0.02,
            blending: THREE.AdditiveBlending,
            depthTest: true,
            depthWrite: false
        });
        material.userData.basePointSize = 1.7;
        const points = new THREE.Points(geometry, material);
        points.renderOrder = 5;
        geographyGroup.add(points);
    }

    if (brightParticlePositions.length) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(brightParticlePositions, 3));
        const material = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 3.2 * globePixelRadius / 124.8,
            sizeAttenuation: false,
            map: texture,
            transparent: true,
            opacity: 0.52,
            alphaTest: 0.01,
            blending: THREE.AdditiveBlending,
            depthTest: true,
            depthWrite: false
        });
        material.userData.basePointSize = 3.2;
        const points = new THREE.Points(geometry, material);
        points.renderOrder = 6;
        geographyGroup.add(points);
    }
}

function renderGeoJsonFallback(geojson) {
    geographyGroup = new THREE.Group();
    spinGroup.add(geographyGroup);
    const coastlinePositions = [];

    (geojson.features || []).forEach(feature => {
        const geometry = feature.geometry;
        if (!geometry) return;
        const polygons = geometry.type === 'Polygon'
            ? [geometry.coordinates]
            : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
        polygons.forEach(rings => {
            rings.forEach(ring => appendArcToSphere(coastlinePositions, ring, 1.012));
        });
    });
    addLineLayer(coastlinePositions, 0.9, 3);
}

function generateSyntheticLandMesh() {
    geographyGroup = new THREE.Group();
    spinGroup.add(geographyGroup);
    const positions = [];
    for (let index = 0; index < 420; index += 1) {
        const y = 1 - (index / 419) * 2;
        const radius = Math.sqrt(Math.max(0, 1 - y * y));
        const theta = index * Math.PI * (3 - Math.sqrt(5));
        positions.push(Math.cos(theta) * radius * 1.012, y * 1.012, Math.sin(theta) * radius * 1.012);
    }
    addParticleLayers(positions, []);
}

function latLonToUnit(lat, lon, radius = GLOBE_RADIUS) {
    const latitude = THREE.MathUtils.degToRad(lat);
    const longitude = THREE.MathUtils.degToRad(lon);
    return new THREE.Vector3(
        radius * Math.cos(latitude) * Math.cos(longitude),
        radius * Math.sin(latitude),
        -radius * Math.cos(latitude) * Math.sin(longitude)
    );
}

function initBloomPipeline() {
    try {
        const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const postScene = new THREE.Scene();
        const quad = new THREE.Mesh(new THREE.PlaneBufferGeometry(2, 2));
        quad.frustumCulled = false;
        postScene.add(quad);

        const vertexShader = `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = vec4(position.xy, 0.0, 1.0);
            }
        `;

        const horizontalMaterial = new THREE.ShaderMaterial({
            uniforms: {
                tDiffuse: { value: null },
                texel: { value: new THREE.Vector2(1, 0) }
            },
            vertexShader,
            fragmentShader: `
                uniform sampler2D tDiffuse;
                uniform vec2 texel;
                varying vec2 vUv;
                vec3 bright(vec4 sampleColor) {
                    float luminance = max(sampleColor.r, max(sampleColor.g, sampleColor.b));
                    return sampleColor.rgb * smoothstep(0.14, 0.58, luminance);
                }
                void main() {
                    vec3 color = bright(texture2D(tDiffuse, vUv)) * 0.227027;
                    color += bright(texture2D(tDiffuse, vUv + texel * 2.007692)) * 0.316216;
                    color += bright(texture2D(tDiffuse, vUv - texel * 2.007692)) * 0.316216;
                    color += bright(texture2D(tDiffuse, vUv + texel * 4.684615)) * 0.070270;
                    color += bright(texture2D(tDiffuse, vUv - texel * 4.684615)) * 0.070270;
                    gl_FragColor = vec4(color, max(color.r, max(color.g, color.b)));
                }
            `,
            depthTest: false,
            depthWrite: false,
            blending: THREE.NoBlending
        });

        const verticalMaterial = new THREE.ShaderMaterial({
            uniforms: {
                tDiffuse: { value: null },
                texel: { value: new THREE.Vector2(0, 1) }
            },
            vertexShader,
            fragmentShader: `
                uniform sampler2D tDiffuse;
                uniform vec2 texel;
                varying vec2 vUv;
                void main() {
                    vec3 color = texture2D(tDiffuse, vUv).rgb * 0.227027;
                    color += texture2D(tDiffuse, vUv + texel * 2.007692).rgb * 0.316216;
                    color += texture2D(tDiffuse, vUv - texel * 2.007692).rgb * 0.316216;
                    color += texture2D(tDiffuse, vUv + texel * 4.684615).rgb * 0.070270;
                    color += texture2D(tDiffuse, vUv - texel * 4.684615).rgb * 0.070270;
                    gl_FragColor = vec4(color, max(color.r, max(color.g, color.b)));
                }
            `,
            depthTest: false,
            depthWrite: false,
            blending: THREE.NoBlending
        });

        const compositeMaterial = new THREE.ShaderMaterial({
            uniforms: {
                tScene: { value: null },
                tBloom: { value: null },
                sceneTexel: { value: new THREE.Vector2(1, 1) },
                bloomStrength: { value: 0.92 },
                revealOpacity: { value: 0 }
            },
            vertexShader,
            fragmentShader: `
                uniform sampler2D tScene;
                uniform sampler2D tBloom;
                uniform vec2 sceneTexel;
                uniform float bloomStrength;
                uniform float revealOpacity;
                varying vec2 vUv;
                void main() {
                    vec4 base = texture2D(tScene, vUv);
                    // WebGL's native lines are one device pixel. Give coastlines
                    // a subpixel luminous core before the wider bloom composite.
                    vec3 core = base.rgb;
                    core = max(core, texture2D(tScene, vUv + vec2(sceneTexel.x, 0.0)).rgb);
                    core = max(core, texture2D(tScene, vUv - vec2(sceneTexel.x, 0.0)).rgb);
                    core = max(core, texture2D(tScene, vUv + vec2(0.0, sceneTexel.y)).rgb);
                    core = max(core, texture2D(tScene, vUv - vec2(0.0, sceneTexel.y)).rgb);
                    core = max(core, texture2D(tScene, vUv + sceneTexel * 0.7071).rgb);
                    core = max(core, texture2D(tScene, vUv - sceneTexel * 0.7071).rgb);
                    core = max(core, texture2D(tScene, vUv + vec2(sceneTexel.x, -sceneTexel.y) * 0.7071).rgb);
                    core = max(core, texture2D(tScene, vUv + vec2(-sceneTexel.x, sceneTexel.y) * 0.7071).rgb);
                    base.rgb = mix(base.rgb, core, 0.62);
                    vec3 bloom = texture2D(tBloom, vUv).rgb * bloomStrength;
                    float bloomAlpha = clamp(max(bloom.r, max(bloom.g, bloom.b)), 0.0, 1.0);
                    vec3 color = (base.rgb + bloom) * revealOpacity;
                    float alpha = (1.0 - (1.0 - base.a) * (1.0 - bloomAlpha)) * revealOpacity;
                    alpha = max(alpha, max(color.r, max(color.g, color.b)));
                    color = min(color, vec3(alpha));
                    gl_FragColor = vec4(color, alpha);
                }
            `,
            transparent: true,
            depthTest: false,
            depthWrite: false,
            blending: THREE.NoBlending
        });

        bloomPipeline = {
            postCamera,
            postScene,
            quad,
            horizontalMaterial,
            verticalMaterial,
            compositeMaterial,
            sceneTarget: null,
            bloomTargetA: null,
            bloomTargetB: null
        };
        resizeBloomTargets();
    } catch (error) {
        bloomPipeline = null;
        console.warn('[SphereLauncher] Bloom disabled:', error);
    }
}

function createRenderTarget(width, height, depthBuffer) {
    return new THREE.WebGLRenderTarget(width, height, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
        depthBuffer,
        stencilBuffer: false
    });
}

function resizeBloomTargets() {
    if (!bloomPipeline || !renderer) return;
    const width = Math.max(1, window.innerWidth || 1);
    const height = Math.max(1, window.innerHeight || 1);
    const pixelRatio = renderer.getPixelRatio();
    const fullWidth = Math.max(1, Math.round(width * pixelRatio));
    const fullHeight = Math.max(1, Math.round(height * pixelRatio));
    const bloomWidth = Math.max(1, Math.round(fullWidth * 0.34));
    const bloomHeight = Math.max(1, Math.round(fullHeight * 0.34));

    if (!bloomPipeline.sceneTarget) {
        bloomPipeline.sceneTarget = createRenderTarget(fullWidth, fullHeight, true);
        bloomPipeline.bloomTargetA = createRenderTarget(bloomWidth, bloomHeight, false);
        bloomPipeline.bloomTargetB = createRenderTarget(bloomWidth, bloomHeight, false);
    } else {
        bloomPipeline.sceneTarget.setSize(fullWidth, fullHeight);
        bloomPipeline.bloomTargetA.setSize(bloomWidth, bloomHeight);
        bloomPipeline.bloomTargetB.setSize(bloomWidth, bloomHeight);
    }

    const visualScale = globePixelRadius / 124.8 * pixelRatio;
    bloomPipeline.horizontalMaterial.uniforms.texel.value.set(visualScale / bloomWidth, 0);
    bloomPipeline.verticalMaterial.uniforms.texel.value.set(0, visualScale / bloomHeight);
    bloomPipeline.compositeMaterial.uniforms.sceneTexel.value.set(0.8 * visualScale / fullWidth, 0.8 * visualScale / fullHeight);
}

function renderWithBloom(revealOpacity) {
    if (!bloomPipeline) {
        renderer.setRenderTarget(null);
        renderer.clear();
        renderer.domElement.style.opacity = String(revealOpacity);
        renderer.render(scene, camera);
        return;
    }

    renderer.domElement.style.opacity = '1';
    const pipeline = bloomPipeline;

    renderer.setRenderTarget(pipeline.sceneTarget);
    renderer.clear();
    renderer.render(scene, camera);

    pipeline.quad.material = pipeline.horizontalMaterial;
    pipeline.horizontalMaterial.uniforms.tDiffuse.value = pipeline.sceneTarget.texture;
    renderer.setRenderTarget(pipeline.bloomTargetA);
    renderer.clear();
    renderer.render(pipeline.postScene, pipeline.postCamera);

    pipeline.quad.material = pipeline.verticalMaterial;
    pipeline.verticalMaterial.uniforms.tDiffuse.value = pipeline.bloomTargetA.texture;
    renderer.setRenderTarget(pipeline.bloomTargetB);
    renderer.clear();
    renderer.render(pipeline.postScene, pipeline.postCamera);

    pipeline.quad.material = pipeline.compositeMaterial;
    pipeline.compositeMaterial.uniforms.tScene.value = pipeline.sceneTarget.texture;
    pipeline.compositeMaterial.uniforms.tBloom.value = pipeline.bloomTargetB.texture;
    pipeline.compositeMaterial.uniforms.revealOpacity.value = revealOpacity;
    renderer.setRenderTarget(null);
    renderer.clear();
    renderer.render(pipeline.postScene, pipeline.postCamera);
}

function setupAnchorPoints() {
    const definitions = [
        ['left', 'left-0', 132],
        ['left', 'left-1', 185],
        ['left', 'left-2', 220],
        ['right', 'right-0', 48],
        ['right', 'right-1', -5],
        ['right', 'right-2', -40]
    ];

    anchorPoints = definitions.map(([side, id, angleDegrees]) => {
        const angle = THREE.MathUtils.degToRad(angleDegrees);
        return {
            side,
            id,
            localPosition: new THREE.Vector3(Math.cos(angle) * 1.07, Math.sin(angle) * 1.07, 0)
        };
    });
}

function updateTraces() {
    if (!camera || !renderer || !globeRoot) return;

    const width = window.innerWidth || 1;
    const height = window.innerHeight || 1;
    const focalFactor = (camera && camera.position.z)
        ? (Math.sqrt(Math.max(1, camera.position.z * camera.position.z - globePixelRadius * globePixelRadius)) / camera.position.z)
        : 1;
    const floatScreenDelta = (globeRoot.position.y - baseGlobePosY) * focalFactor;

    anchorPoints.forEach(anchor => {
        // The traces attach just outside the projected silhouette, tracking the
        // floating globe center so SVG bezier curves stay locked to the sphere.
        const xStart = width * 0.5 + anchor.localPosition.x * globeRoot.scale.x;
        const yStart = height * GLOBE_CENTER_Y - floatScreenDelta - anchor.localPosition.y * globeRoot.scale.x;
        const cardElement = document.getElementById(`card-${anchor.id}`);
        const traceElement = document.getElementById(`trace-${anchor.id}`);
        const dotElement = document.getElementById(`dot-${anchor.id}`);

        if (!cardElement || !traceElement) return;

        if (dotElement) {
            dotElement.setAttribute('cx', xStart.toFixed(1));
            dotElement.setAttribute('cy', yStart.toFixed(1));
        }

        const isSlotEmpty = cardElement.classList.contains('empty-slot');
        if (isSlotEmpty && !traceElement.classList.contains('visible')) {
            traceElement.setAttribute('d', '');
            return;
        }

        const rect = cardElement.getBoundingClientRect();
        if (!rect.width || !rect.height) return;

        const isLeft = anchor.side === 'left';
        const xEnd = isLeft ? rect.right : rect.left;
        const yEnd = rect.top + rect.height * 0.5;
        const dx = Math.abs(xEnd - xStart);
        const dy = yEnd - yStart;
        const firstControlX = isLeft ? xStart - dx * 0.38 : xStart + dx * 0.38;
        const secondControlX = isLeft ? xEnd + dx * 0.34 : xEnd - dx * 0.34;
        const firstControlY = yStart + dy * 0.08;
        const secondControlY = yEnd - dy * 0.08;

        traceElement.setAttribute(
            'd',
            `M ${xStart.toFixed(1)} ${yStart.toFixed(1)} C ${firstControlX.toFixed(1)} ${firstControlY.toFixed(1)}, ${secondControlX.toFixed(1)} ${secondControlY.toFixed(1)}, ${xEnd.toFixed(1)} ${yEnd.toFixed(1)}`
        );
    });
}

function triggerGlobeReveal(isInitial = false) {
    revealStartedAt = performance.now() + (isInitial ? FIRST_REVEAL_DELAY : 30);
    rotationAngle = INITIAL_ROTATION;
    lastFrameTime = 0;
    launcherActive = true;
    if (!isInitial && renderer && animId === null) animate();
}

function revealState(now) {
    if (now < revealStartedAt) return { opacity: 0, scale: 0.001 };
    const progress = THREE.MathUtils.clamp((now - revealStartedAt) / REVEAL_DURATION, 0, 1);
    const overshoot = 1.3;
    const shifted = progress - 1;
    const eased = 1 + (overshoot + 1) * Math.pow(shifted, 3) + overshoot * Math.pow(shifted, 2);
    return {
        opacity: Math.min(eased, 1),
        scale: Math.max(eased, 0.001)
    };
}

function animate(now = performance.now()) {
    if (!launcherActive) {
        animId = null;
        return;
    }
    animId = requestAnimationFrame(animate);
    if (!renderer || !scene || !camera || !globeRoot || !spinGroup) return;

    const state = revealState(now);
    globeRoot.scale.setScalar(globePixelRadius * state.scale);

    // 1. Antigravity Levitation: smooth floating vertical oscillation
    const floatOffset = Math.sin(now * 0.0016) * (globePixelRadius * 0.015);
    globeRoot.position.y = baseGlobePosY + floatOffset;

    // 2. Holographic Breathing: subtle rhythmic expansion of atmosphere and ambient halo
    const breath = 1 + Math.sin(now * 0.0022) * 0.035;
    if (ambientHalo) ambientHalo.scale.set(2.32 * breath, 2.32 * breath, 1);
    if (atmosphereMesh) atmosphereMesh.scale.setScalar(1.038 * (1 + Math.sin(now * 0.0022) * 0.012));

    // 3. Rotation with Inertia Momentum decay on drag release
    const delta = lastFrameTime ? Math.min((now - lastFrameTime) / 1000, 0.05) : 0;
    lastFrameTime = now;
    if (!isDragging && Math.abs(dragVelocity) > 0.0001) {
        rotationAngle += dragVelocity;
        dragVelocity *= 0.945;
    } else if (!isDragging) {
        rotationAngle += delta * ROTATION_SPEED * rotationMultiplier;
    }
    spinGroup.rotation.y = rotationAngle;

    // 4. Cursor 3D Spatial Tilt (Antigravity Spatial Physics)
    const targetTiltX = 0.04 + (pointerNormalizedY * 0.08);
    const targetTiltZ = -0.025 + (-pointerNormalizedX * 0.06);
    spinGroup.rotation.x = THREE.MathUtils.lerp(spinGroup.rotation.x, targetTiltX, 0.06);
    spinGroup.rotation.z = THREE.MathUtils.lerp(spinGroup.rotation.z, targetTiltZ, 0.06);

    updateHotspots();
    renderWithBloom(state.opacity);
    updateTraces();
}

function onWindowResize() {
    if (!camera || !renderer || !globeRoot) return;
    const width = Math.max(1, window.innerWidth || 1);
    const height = Math.max(1, window.innerHeight || 1);

    renderer.setPixelRatio(getRenderPixelRatio());
    renderer.setSize(width, height, false);

    globePixelRadius = computeGlobeRadius(width, height);
    scene.traverse(object => {
        if (object.isPoints && object.material.userData.basePointSize) {
            object.material.size = object.material.userData.basePointSize * globePixelRadius / 124.8;
        }
    });
    const distance = globePixelRadius * 2.7;
    const focalLength = Math.sqrt(distance * distance - globePixelRadius * globePixelRadius);
    camera.aspect = width / height;
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(height / (2 * focalLength)));
    camera.position.z = distance;
    camera.updateProjectionMatrix();
    document.documentElement.style.setProperty('--globe-radius', `${globePixelRadius}px`);
    baseGlobePosY = height * (0.5 - GLOBE_CENTER_Y) * focalLength / distance;
    globeRoot.position.set(0, baseGlobePosY, 0);
    resizeBloomTargets();
}

window.initGlobe = initGlobe;
window.revealGlobe = () => triggerGlobeReveal(false);
window.onLauncherHidden = () => {
    launcherActive = false;
    cancelAnimationFrame(animId);
    animId = null;
    lastFrameTime = 0;
};

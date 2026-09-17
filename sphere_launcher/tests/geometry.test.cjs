const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const THREE = require('../web/three.min.js');

const context = vm.createContext({ THREE, window: {}, console });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../web/globe.js'), 'utf8'), context);
const run = expression => vm.runInContext(expression, context);

test('reference proportions scale with the viewport', () => {
    assert.equal(run('computeGlobeRadius(1024, 576)'), 124.8);
    assert.equal(run('computeGlobeRadius(1920, 1080)'), 234);
    assert.equal(run('computeGlobeRadius(3840, 2160)'), 260);
});

test('land masking respects polygon holes', () => {
    run(`testPolygon = prepareLandPolygon([
        [[0,0],[10,0],[10,10],[0,10],[0,0]],
        [[3,3],[7,3],[7,7],[3,7],[3,3]]
    ])`);
    assert.equal(run('isLand(1, 1, [testPolygon])'), true);
    assert.equal(run('isLand(5, 5, [testPolygon])'), false);
    assert.equal(run('isLand(20, 5, [testPolygon])'), false);
});

test('land polygons crossing the date line do not span the whole ocean', () => {
    run('dateLinePolygon = prepareLandPolygon([[[170,-10],[-170,-10],[-170,10],[170,10],[170,-10]]])');
    assert.equal(run('isLand(179, 0, [dateLinePolygon])'), true);
    assert.equal(run('isLand(-179, 0, [dateLinePolygon])'), true);
    assert.equal(run('isLand(0, 0, [dateLinePolygon])'), false);
});

test('geographic projection round-trips', () => {
    for (const [lat, lon] of [[0, 0], [21, 106], [-25, 135], [55, -105], [80, 170]]) {
        const result = run(`unitToLonLat(latLonToUnit(${lat}, ${lon}))`);
        assert.ok(Math.abs(result.lat - lat) < 1e-8);
        assert.ok(Math.abs(result.lon - lon) < 1e-8);
    }
});

test('reference geography produces deterministic, short spherical edges', () => {
    context.topology = JSON.parse(fs.readFileSync(path.join(__dirname, '../web/countries-110m.json'), 'utf8'));
    run(`
        spinGroup = new THREE.Group();
        capturedLayers = [];
        capturedParticles = [];
        addLineLayer = (positions, opacity, order) => capturedLayers.push({ positions, opacity, order });
        addParticleLayers = (normal, bright) => { capturedParticles = [normal, bright]; };
        renderCountryTopology(topology);
    `);
    const layers = context.capturedLayers;
    assert.equal(layers.length, 4);
    for (const { positions } of layers) {
        assert.ok(positions.length > 0);
        assert.equal(positions.length % 6, 0);
        for (let i = 0; i < positions.length; i += 6) {
            const a = new THREE.Vector3().fromArray(positions, i);
            const b = new THREE.Vector3().fromArray(positions, i + 3);
            assert.ok(a.toArray().concat(b.toArray()).every(Number.isFinite));
            assert.ok(a.length() > 1 && a.length() < 1.02);
            assert.ok(b.length() > 1 && b.length() < 1.02);
            assert.ok(THREE.MathUtils.radToDeg(a.angleTo(b)) <= 2.20001);
        }
    }
    assert.ok(context.capturedParticles[0].length > 500);
    const first = JSON.stringify(layers);
    run('capturedLayers = []; renderCountryTopology(topology)');
    assert.equal(JSON.stringify(context.capturedLayers), first);
});

test('reveal waits, overshoots, and settles to the full sphere', () => {
    run('revealStartedAt = 1000');
    assert.equal(run('revealState(999).opacity'), 0);
    assert.ok(run('revealState(1400).scale') > 1);
    assert.equal(run('revealState(1550).scale'), 1);
    assert.equal(run('revealState(1550).opacity'), 1);
});

import * as THREE from 'https://esm.sh/three@0.160.0';
import { OrbitControls } from 'https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js';

export { THREE };

export class ThreeView {
    constructor(containerId = 'three-container') {
        this.container = document.getElementById(containerId);

        if (!this.container) {
            throw new Error(`Container #${containerId} not found`);
        }

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xf0f0f0);

        this.camera = new THREE.PerspectiveCamera(
            45,
            this.container.clientWidth / this.container.clientHeight,
            0.1,
            10000
        );
        this.camera.position.set(0, 0, 600);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio || 1);
        this.container.appendChild(this.renderer.domElement);

        this.rootGroup = new THREE.Group();
        this.scene.add(this.rootGroup);

        this.groups = {};

        const ambient = new THREE.AmbientLight(0xffffff, 0.9);
        this.scene.add(ambient);

        const directional = new THREE.DirectionalLight(0xffffff, 0.8);
        directional.position.set(200, 300, 400);
        this.scene.add(directional);

        this.grid = new THREE.GridHelper(800, 16);
        this.grid.rotation.x = Math.PI / 2;
        this.scene.add(this.grid);

        this.axes = new THREE.AxesHelper(150);
        this.scene.add(this.axes);

        this.controls = new OrbitControls(
            this.camera,
            this.renderer.domElement
        );
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.screenSpacePanning = true;
        this.controls.enablePan = true;
        this.controls.enableZoom = true;
        this.controls.enableRotate = true;
        this.controls.target.set(0, 0, 0);

        this.hasFittedOnce = false;

        this.animate = this.animate.bind(this);
        this.onResize = this.onResize.bind(this);

        window.addEventListener('resize', this.onResize);
        this.animate();
    }

    getOrCreateGroup(name) {
        if (!this.groups[name]) {
            const group = new THREE.Group();
            group.name = name;
            this.groups[name] = group;
            this.rootGroup.add(group);
        }

        return this.groups[name];
    }

    clearObject(object) {
        while (object.children.length > 0) {
            const child = object.children[0];
            object.remove(child);

            this.disposeObject(child);
        }
    }

    disposeObject(object) {
        if (object.children && object.children.length > 0) {
            while (object.children.length > 0) {
                const child = object.children[0];
                object.remove(child);
                this.disposeObject(child);
            }
        }

        if (object.geometry) {
            object.geometry.dispose();
        }

        if (object.material) {
            if (Array.isArray(object.material)) {
                object.material.forEach(material => material.dispose());
            } else {
                object.material.dispose();
            }
        }
    }

    clearRoot() {
        this.clearObject(this.rootGroup);
        this.groups = {};
    }

    clearGroup(groupOrName) {
        const group = typeof groupOrName === 'string'
            ? this.groups[groupOrName]
            : groupOrName;

        if (!group) return;

        this.clearObject(group);
    }

    fitCameraToObject(object, offset = 1.4) {
        const box = new THREE.Box3().setFromObject(object);

        if (box.isEmpty()) return;

        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        const maxDim = Math.max(size.x, size.y, size.z, 1);
        const fov = this.camera.fov * (Math.PI / 180);
        let cameraDistance = (maxDim / 2) / Math.tan(fov / 2);
        cameraDistance *= offset;

        this.camera.position.set(center.x, center.y, center.z + cameraDistance);
        this.camera.near = Math.max(0.1, cameraDistance / 100);
        this.camera.far = Math.max(1000, cameraDistance * 10);
        this.camera.updateProjectionMatrix();

        this.controls.target.copy(center);
        this.controls.update();

        const gridSize = Math.max(200, Math.ceil(maxDim * 2));

        this.scene.remove(this.grid);
        this.grid.geometry.dispose();
        this.grid.material.dispose();

        this.grid = new THREE.GridHelper(gridSize, 16);
        this.grid.rotation.x = Math.PI / 2;
        this.grid.position.set(center.x, center.y, center.z);
        this.scene.add(this.grid);
    }

    resetViewToRoot() {
        this.fitCameraToObject(this.rootGroup);
        this.hasFittedOnce = true;
    }

    onResize() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    animate() {
        requestAnimationFrame(this.animate);
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }
}
import * as THREE from 'https://esm.sh/three@0.160.0';
import { OrbitControls } from 'https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js';

class Skeleton3DView {
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

        this.animate = this.animate.bind(this);
        this.onResize = this.onResize.bind(this);

        window.addEventListener('resize', this.onResize);
        this.animate();
    }

    clearSkeleton() {
        while (this.rootGroup.children.length > 0) {
            const child = this.rootGroup.children[0];
            this.rootGroup.remove(child);

            if (child.geometry) child.geometry.dispose();

            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => m.dispose());
                } else {
                    child.material.dispose();
                }
            }
        }
    }

    fitCameraToObject(object, offset = 1.4) {
        const box = new THREE.Box3().setFromObject(object);

        if (box.isEmpty()) return;

        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        const maxDim = Math.max(size.x, size.y, size.z, 1);
        const fov = this.camera.fov * (Math.PI / 180);
        let cameraZ = (maxDim / 2) / Math.tan(fov / 2);
        cameraZ *= offset;

        this.camera.position.set(center.x, center.y, center.z + cameraZ);
        this.camera.near = Math.max(0.1, cameraZ / 100);
        this.camera.far = Math.max(1000, cameraZ * 10);
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

    drawSkeleton(skeleton) {
        this.clearSkeleton();

        if (!skeleton || skeleton.points.length === 0) return;

        const pointGeometry = new THREE.SphereGeometry(5, 16, 16);

        skeleton.points.forEach(point => {
            const pointMaterial = new THREE.MeshStandardMaterial({ color: 0xff3333 });
            const sphere = new THREE.Mesh(pointGeometry, pointMaterial);
            sphere.position.set(point.x, point.y, point.z ?? 0);
            this.rootGroup.add(sphere);
        });

        skeleton.lines.forEach(line => {
            const start = new THREE.Vector3(
                line.start.x,
                line.start.y,
                line.start.z ?? 0
            );

            const end = new THREE.Vector3(
                line.end.x,
                line.end.y,
                line.end.z ?? 0
            );

            const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
            const material = new THREE.LineBasicMaterial({ color: 0x3366ff });
            const mesh = new THREE.Line(geometry, material);
            this.rootGroup.add(mesh);
        });

        this.fitCameraToObject(this.rootGroup);
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

window.skeleton3DView = new Skeleton3DView('three-container');
import { GfxDevice } from "../gfx/platform/GfxPlatform.js";
import { SceneContext, SceneDesc, SceneGroup } from "../SceneBase.js";
import { MeleeRenderer } from "../SuperSmashBrosMelee/Scenes_SuperSmashBrosMelee.js";
import {
    HSD_AnimJointRoot,
    HSD_AObjLoadAnimJoint,
    HSD_AObjLoadMatAnimJoint,
    HSD_AObjLoadShapeAnimJoint,
    HSD_Archive,
    HSD_Archive_FindPublic,
    HSD_ArchiveParse,
    HSD_JObjLoadJoint,
    HSD_LoadContext,
    HSD_LoadContext__ResolvePtr,
    HSD_MatAnimJointRoot,
    HSD_ShapeAnimJointRoot,
} from "../SYSDOLPHIN/SYSDOLPHIN.js";
import { HSD_JObjRoot_Instance } from "../SYSDOLPHIN/SYSDOLPHIN_Render.js";
import { assertExists } from "../util.js";
import { SceneGfx } from "../viewer.js";

const pathBase = `MarioKartArcadeGP`;

function loadSceneDataArchive(renderer: MeleeRenderer, arc: HSD_Archive): void {
    const ctx = new HSD_LoadContext(arc);
    const sceneDataSlice = HSD_Archive_FindPublic(arc, `scene_data`);
    if (sceneDataSlice === null)
        return;

    const sceneData = sceneDataSlice.createDataView();
    const jobjDescsOffs = sceneData.getUint32(0x00);
    if (jobjDescsOffs === 0)
        return;

    const jobjDescs = HSD_LoadContext__ResolvePtr(ctx, jobjDescsOffs).createDataView();
    for (let i = 0; ; i += 4) {
        const jobjDescOffs = jobjDescs.getUint32(i);
        if (jobjDescOffs === 0)
            break;

        const jobjDesc = HSD_LoadContext__ResolvePtr(ctx, jobjDescOffs).createDataView();
        const rootJointOffs = jobjDesc.getUint32(0x00);
        if (rootJointOffs === 0)
            continue;

        const rootJointData = HSD_LoadContext__ResolvePtr(ctx, rootJointOffs, 0x40);
        const rootJoint = assertExists(HSD_JObjLoadJoint(ctx, rootJointData));
        const rootJointInstance = new HSD_JObjRoot_Instance(renderer.modelCache.loadJObjRoot(rootJoint));

        let jointAnimation: HSD_AnimJointRoot | null = null;
        const jointAnimationsOffs = jobjDesc.getUint32(0x04);
        if (jointAnimationsOffs !== 0) {
            const ptrTable = HSD_LoadContext__ResolvePtr(ctx, jointAnimationsOffs).createDataView();
            const animOffs = ptrTable.getUint32(0x00);
            if (animOffs !== 0)
                jointAnimation = HSD_AObjLoadAnimJoint(ctx, HSD_LoadContext__ResolvePtr(ctx, animOffs));
        }

        let materialAnimation: HSD_MatAnimJointRoot | null = null;
        const materialAnimationsOffs = jobjDesc.getUint32(0x08);
        if (materialAnimationsOffs !== 0) {
            const ptrTable = HSD_LoadContext__ResolvePtr(ctx, materialAnimationsOffs).createDataView();
            const animOffs = ptrTable.getUint32(0x00);
            if (animOffs !== 0)
                materialAnimation = HSD_AObjLoadMatAnimJoint(ctx, HSD_LoadContext__ResolvePtr(ctx, animOffs));
        }

        let shapeAnimation: HSD_ShapeAnimJointRoot | null = null;
        const shapeAnimationsOffs = jobjDesc.getUint32(0x0C);
        if (shapeAnimationsOffs !== 0) {
            const ptrTable = HSD_LoadContext__ResolvePtr(ctx, shapeAnimationsOffs).createDataView();
            const animOffs = ptrTable.getUint32(0x00);
            if (animOffs !== 0)
                shapeAnimation = HSD_AObjLoadShapeAnimJoint(ctx, HSD_LoadContext__ResolvePtr(ctx, animOffs));
        }

        if (jointAnimation !== null || materialAnimation !== null || shapeAnimation !== null)
            rootJointInstance.addAnimAll(jointAnimation, materialAnimation, shapeAnimation);

        renderer.jobjRoots.push(rootJointInstance);
    }
}

class MarioKartArcadeGPSceneDesc implements SceneDesc {
    constructor(public id: string, public name: string, private files: string[]) {}

    public async createScene(device: GfxDevice, context: SceneContext): Promise<SceneGfx> {
        const dataFetcher = context.dataFetcher;
        const renderer = new MeleeRenderer(device);

        const buffers = await Promise.all(this.files.map((file) => dataFetcher.fetchData(`${pathBase}/${file}`)));
        for (const buffer of buffers) {
            const arc = HSD_ArchiveParse(buffer);
            loadSceneDataArchive(renderer, arc);
        }

        return renderer;
    }
}

const id = `MarioKartArcadeGP`;
const name = `Mario Kart Arcade GP`;
const sceneDescs = [
    new MarioKartArcadeGPSceneDesc(`MR_highway_short_day`, `Mario Highway (Short - Day)`, [
        `MRA_s_day.dat`,
        `MR_highway_short_A.dat`,
    ]),
    new MarioKartArcadeGPSceneDesc(`MR_highway_short_eve`, `Mario Highway (Short - Evening)`, [
        `MRA_s_eve.dat`,
        `MR_highway_short_B.dat`,
    ]),
    new MarioKartArcadeGPSceneDesc(`MR_highway_short_night`, `Mario Highway (Short - Night)`, [
        `MRA_s_night.dat`,
        `MR_highway_short_C.dat`,
    ]),
    new MarioKartArcadeGPSceneDesc(`test_course`, `Test Course`, [
        `test_course_road.dat`,
        `test_course_ground.dat`,
        `test_course_start_gate.dat`,
        `test_course_f_ship.dat`,
        `test_course_coconut.dat`,
        `test_course_bm.dat`,
    ]),
];

export const sceneGroup: SceneGroup = { id, name, sceneDescs };
